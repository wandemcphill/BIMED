import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendContractSignedNotificationEmails } from '@/lib/email';
import { getContractSignatureByToken, markContractSignatureSigned } from '@/lib/contract-signature';
import { createStaffFromApplication } from '@/lib/staff';
import { sendStaffPortalActivationEmail } from '@/lib/email/staff-activation';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';
import { recruitmentRoleSlug, BIMED_DEFAULT_START_DATE_ISO } from '@/lib/bimed-role-policy';
import { getSocClassification, isAdultAtEmploymentStart } from '@/lib/soc-classification';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit({ key: 'sign-contract', limit: 10, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data as Record<string, unknown>;
  const signedName = body.signed_name;
  if (typeof signedName !== 'string' || !signedName.trim() || signedName.trim().length > 200) return NextResponse.json({ error: 'A valid signed_name is required.' }, { status: 400 });

  const corrections: { employeeName?: string; employeeAddress?: string } = {};
  if (body.employee_name !== undefined) {
    if (typeof body.employee_name !== 'string' || !body.employee_name.trim() || body.employee_name.length > 200) return NextResponse.json({ error: 'employee_name must be a non-empty string.' }, { status: 400 });
    corrections.employeeName = body.employee_name.trim();
  }
  if (body.employee_address !== undefined) {
    return NextResponse.json(
      { error: 'The contract address is fixed by the BIMED contract record and cannot be changed at signing.' },
      { status: 400 },
    );
  }

  const { token } = await context.params;

  try {
    const signature = await getContractSignatureByToken(token);
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 });
    if (signature.status === 'revoked') return NextResponse.json({ error: 'This contract-signing link has been superseded. Ask BIMED to issue the current contract link.' }, { status: 409 });
    if (signature.status === 'signed') return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });
    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This signing link has expired. Ask Bimed to issue a new one.' }, { status: 410 });

    const client = db();
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, role_applied, date_of_birth, nationality')
      .eq('id', signature.application_id)
      .maybeSingle();
    if (applicationError || !application) return NextResponse.json({ error: 'The linked recruitment application could not be loaded. Contact BIMED before signing.' }, { status: 409 });
    if (!String(application.nationality || '').trim()) {
      return NextResponse.json({ error: 'Nationality is missing from the source recruitment application. The contract cannot be signed until it is corrected.' }, { status: 409 });
    }
    if (!application.date_of_birth) {
      return NextResponse.json({ error: 'Date of birth is missing from the source recruitment application. The contract cannot be signed until it is corrected.' }, { status: 409 });
    }
    if (!isAdultAtEmploymentStart(application.date_of_birth, signature.start_date || BIMED_DEFAULT_START_DATE_ISO)) {
      return NextResponse.json({ error: 'The source application date of birth is invalid or would make the candidate under 18 on the planned start date. BIMED must verify and correct the application before this contract can be signed.' }, { status: 409 });
    }
    if (recruitmentRoleSlug(application.role_applied) !== signature.role_slug || !getSocClassification(application.role_applied)) {
      return NextResponse.json({ error: 'The occupation classification or role in the recruitment application does not match this contract. BIMED must reconcile the role before signing.' }, { status: 409 });
    }

    const updated = await markContractSignatureSigned(signature.id, signedName.trim(), corrections);
    if (!updated) return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });

    await recordRecruitmentAudit(client, { applicationId: updated.application_id, eventType: 'contract_signed', actor: signedName.trim(), metadata: { signature_id: updated.id, role_slug: updated.role_slug, corrected_fields: Object.keys(corrections) } });

    let staffProvisioning: { staff: any; activationSent: boolean } | null = null;
    try {
      const provisioned = await createStaffFromApplication(client, updated.application_id, {
        lifecycle: {
          toStatus: 'Onboarding',
          actor: 'system:contract-signature',
          note: 'Contract signed by candidate. Promote into the canonical onboarding lifecycle when readiness gates pass.',
        },
      });
      if (provisioned.activationToken && provisioned.staff) {
        const activation = await sendStaffPortalActivationEmail(client, provisioned.staff, provisioned.activationToken, application?.email || null);
        staffProvisioning = { staff: provisioned.staff, activationSent: activation.status === 'sent' };
      } else if (provisioned.staff) {
        staffProvisioning = { staff: provisioned.staff, activationSent: false };
      }
      await recordRecruitmentAudit(client, { applicationId: updated.application_id, staffId: provisioned.staff?.id, actor: 'system', eventType: 'staff_portal_provisioned_after_contract', metadata: { bimed_id: provisioned.staff?.bimed_id, activation_sent: staffProvisioning?.activationSent || false } });
    } catch (staffError) {
      console.error(JSON.stringify({ level: 'error', event: 'staff_portal_provision.failed', application_id: updated.application_id, reason: staffError instanceof Error ? staffError.message : 'unknown' }));
    }

    if (application) {
      await sendContractSignedNotificationEmails({ application, signedName: updated.signed_name || signedName.trim(), signedAtLabel: new Date(updated.signed_at || Date.now()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), signatureId: updated.id }, client);
    }

    return NextResponse.json({ signature: updated, staffPortal: staffProvisioning ? { bimed_id: staffProvisioning.staff.bimed_id, address: staffProvisioning.staff.portal_address, activationSent: staffProvisioning.activationSent } : null });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'contract_signature.sign_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to sign the contract right now.' }, { status: 500 });
  }
}
