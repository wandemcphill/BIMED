import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { activationExpiresAt, createActivationToken, hashActivationToken } from '@/lib/staff-auth';
import { createStaffAudit } from '@/lib/staff';
import { sendStaffPortalActivationEmail } from '@/lib/email/staff-activation';

const ACTIVATABLE_STATUSES = ['active', 'pre_arrival', 'on_leave'];

export async function POST(request: NextRequest) {
  const limiter = await checkRateLimit({
    key: 'staff-activation-resend',
    limit: 3,
    windowMs: 15 * 60 * 1000,
    request,
  });

  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Too many activation-link requests. Please try again later.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } },
    );
  }

  let body: { token?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.', code: 'invalid_request' }, { status: 400 });
  }

  const token = body.token?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!token) {
    return NextResponse.json({ error: 'This activation request is missing its secure token.', code: 'invalid_request' }, { status: 400 });
  }

  const client = db();
  const tokenHash = hashActivationToken(token);

  let { data: staff, error } = await client
    .from('recruitment_staff')
    .select('id,bimed_id,email,status,full_name,preferred_name,job_title,role,application_id,activation_token_hash,activation_expires_at,activated_at')
    .eq('activation_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to request a new activation link.', code: 'activation_error' }, { status: 500 });
  }

  // Keep the external response generic when the account cannot be recovered.
  if (!staff || !ACTIVATABLE_STATUSES.includes(staff.status) || staff.activated_at) {
    return NextResponse.json({
      ok: true,
      status: 'not_available',
      message: 'If this BIMED account is eligible for a new activation link, the latest link has been sent to the email address used during recruitment.',
    });
  }

  if (email && email !== String(staff.email).trim().toLowerCase()) {
    return NextResponse.json(
      { error: 'The BIMED email entered does not match this activation request.', code: 'email_mismatch' },
      { status: 400 },
    );
  }

  const { data: application, error: applicationError } = staff.application_id
    ? await client.from('recruitment_applications').select('email').eq('id', staff.application_id).maybeSingle()
    : { data: null, error: null };

  if (applicationError) {
    return NextResponse.json({ error: 'Unable to identify the recruitment email for this account.', code: 'activation_error' }, { status: 500 });
  }

  const deliveryEmail = application?.email?.trim().toLowerCase() || String(staff.email).trim().toLowerCase();
  if (!deliveryEmail) {
    return NextResponse.json({ error: 'No delivery email is available for this staff account. Please contact BIMED.', code: 'delivery_unavailable' }, { status: 409 });
  }

  const oldTokenHash = staff.activation_token_hash;
  const oldExpiry = staff.activation_expires_at;
  const newToken = createActivationToken();
  const newTokenHash = hashActivationToken(newToken);
  const newExpiry = activationExpiresAt();

  const { error: updateError } = await client
    .from('recruitment_staff')
    .update({
      activation_token_hash: newTokenHash,
      activation_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', staff.id);

  if (updateError) {
    return NextResponse.json({ error: 'Unable to generate a new activation link.', code: 'activation_error' }, { status: 500 });
  }

  let delivery;
  try {
    delivery = await sendStaffPortalActivationEmail(client, staff, newToken, deliveryEmail, { mode: 'replacement' });
  } catch (sendError) {
    delivery = { status: 'failed', reason: sendError instanceof Error ? sendError.message : 'Unable to send activation email.' } as any;
  }

  if (delivery.status !== 'sent') {
    await client
      .from('recruitment_staff')
      .update({
        activation_token_hash: oldTokenHash,
        activation_expires_at: oldExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.id)
      .eq('activation_token_hash', newTokenHash);

    return NextResponse.json(
      { error: 'We could not send the new activation link right now. Your previous link remains unchanged. Please try again later or contact BIMED.', code: 'delivery_failed' },
      { status: 502 },
    );
  }

  await createStaffAudit(client, {
    staffId: staff.id,
    actor: 'staff_activation_resend',
    eventType: 'staff_activation_reissued',
    metadata: {
      delivery_email: deliveryEmail,
      previous_token_replaced: Boolean(oldTokenHash),
      expiry: newExpiry,
    },
  });

  return NextResponse.json({
    ok: true,
    status: 'sent',
    message: 'A new activation link has been sent to the email address used during your BIMED recruitment.',
  });
}
