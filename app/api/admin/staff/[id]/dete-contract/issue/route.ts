import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';
import { db } from '@/lib/db';
import {
  getSignedDeteContractSignatureForStaff,
  getLatestDeteContractSignatureForStaff,
  issueDeteContractSignature,
} from '@/lib/dete-contract-signature';
import { sendDetePermitContractReadyToSignEmail, getAppUrl } from '@/lib/email';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id: staffId } = await context.params;
  const result = await resolveStaffContractTemplate(staffId);

  if (result.status !== 'template') {
    return NextResponse.json(
      { error: result.status === 'blocked' ? result.reason : 'The permit-stage contract could not be prepared.' },
      { status: 409 }
    );
  }

  const client = db();
  const { data: application } = await client
    .from('recruitment_applications')
    .select('id,full_name,email,role_applied')
    .eq('id', result.context.applicationId)
    .maybeSingle();

  if (!application?.email) {
    return NextResponse.json({ error: 'The candidate email address is missing from the recruitment record.' }, { status: 409 });
  }

  const signed = await getSignedDeteContractSignatureForStaff(staffId);
  if (signed) {
    return NextResponse.json(
      {
        error: 'A permit-stage contract has already been signed for this staff record. The signed record is retained and cannot be silently replaced.',
        signedAt: signed.employee_signed_at,
        signedName: signed.employee_signed_name,
      },
      { status: 409 }
    );
  }

  const latest = await getLatestDeteContractSignatureForStaff(staffId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  let issued;
  try {
    issued = await issueDeteContractSignature({
      staffId,
      applicationId: result.context.applicationId!,
      roleSlug: result.context.roleSlug,
      bimedId: result.context.bimedId,
      employeeName: result.context.employeeName,
      employeeEmail: application.email,
      template: result.template,
      issuedBy: session.email,
      expiresAt,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'dete_contract_issue.failed',
      staff_id: staffId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to issue the permit-stage contract right now.' }, { status: 500 });
  }

  await recordRecruitmentAudit(client, {
    applicationId: result.context.applicationId,
    staffId,
    actor: session.email,
    eventType: 'dete_permit_contract_issued',
    metadata: {
      signature_id: issued.signature.id,
      replaced_signature_id: latest?.status === 'issued' ? latest.id : null,
      expires_at: expiresAt,
      permit_application_id: result.context.permitApplicationId,
      permit_submission_route: result.context.permitSubmissionRoute,
    },
  });

  const signUrl = getAppUrl() + '/sign-dete-contract/' + issued.token;
  const emailResult = await sendDetePermitContractReadyToSignEmail(
    {
      application: {
        id: application.id,
        full_name: application.full_name,
        email: application.email,
        role_applied: application.role_applied,
      },
      signUrl,
      primaryAssignment: result.context.primaryAssignment,
      expiresAt,
      signatureId: issued.signature.id,
    },
    client
  );

  return NextResponse.json({
    ok: true,
    signatureId: issued.signature.id,
    emailStatus: emailResult.status,
    message:
      emailResult.status === 'sent'
        ? 'The permit-stage contract was issued and the candidate was emailed the signing link.'
        : 'The permit-stage contract was issued, but the candidate email was not sent. Check the email log/configuration and reissue when ready.',
  });
}
