import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendContractSignedNotificationEmails } from '@/lib/email';
import { getContractSignatureByToken, markContractSignatureSigned } from '@/lib/contract-signature';
import { createStaffFromApplication } from '@/lib/staff';
import { sendStaffPortalActivationEmail } from '@/lib/email/staff-activation';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

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
    if (typeof body.employee_address !== 'string' || body.employee_address.length > 500) return NextResponse.json({ error: 'employee_address must be a string.' }, { status: 400 });
    corrections.employeeAddress = body.employee_address.trim();
  }

  const { token } = await context.params;

  try {
    const signature = await getContractSignatureByToken(token);
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 });
    if (signature.status === 'signed') return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });
    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This signing link has expired. Ask Bimed to issue a new one.' }, { status: 410 });

    const client = db();
    const updated = await markContractSignatureSigned(signature.id, signedName.trim(), corrections);
    if (!updated) return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });

    const { data: application } = await client.from('recruitment_applications').select('id, full_name, email, role_applied').eq('id', updated.application_id).maybeSingle();

    await recordRecruitmentAudit(client, { applicationId: updated.application_id, eventType: 'contract_signed', actor: signedName.trim(), metadata: { signature_id: updated.id, role_slug: updated.role_slug, corrected_fields: Object.keys(corrections) } });

    let staffProvisioning: { staff: any; activationSent: boolean } | null = null;
    try {
      const provisioned = await createStaffFromApplication(client, updated.application_id);
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
