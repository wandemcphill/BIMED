import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashStaffPassword, createStaffSessionToken, hashActivationToken, setStaffSessionCookie } from '@/lib/staff-auth';
import { createStaffAudit } from '@/lib/staff';

const ACTIVATABLE_STATUSES = ['active', 'pre_arrival', 'on_leave'];

export async function POST(request: NextRequest) {
  const limiter = await checkRateLimit({ key: 'staff-activation', limit: 6, windowMs: 15 * 60 * 1000, request });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Too many activation attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } },
    );
  }

  let body: { token?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const token = body.token?.trim();
  const email = body.email?.trim().toLowerCase() || null;
  const password = body.password || '';

  if (!token || password.length < 10) {
    return NextResponse.json(
      { error: 'A valid activation link and a password of at least 10 characters are required.', code: 'invalid_request' },
      { status: 400 },
    );
  }

  const client = db();
  const tokenHash = hashActivationToken(token);

  // Look up by the secret token first so we can distinguish expiry and email-entry
  // mistakes without exposing staff records to arbitrary email lookups.
  const { data: staff, error } = await client
    .from('recruitment_staff')
    .select('id,bimed_id,email,status,session_version,activation_expires_at,activated_at')
    .eq('activation_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to activate this account.', code: 'activation_error' }, { status: 500 });
  }

  if (!staff) {
    // A consumed token is intentionally removed on successful activation. If the
    // candidate returns to that old link, use the BIMED email supplied by the page
    // only to explain that the account is already active.
    if (email) {
      const { data: byEmail } = await client
        .from('recruitment_staff')
        .select('id,bimed_id,email,status,activated_at')
        .eq('email', email)
        .maybeSingle();

      if (byEmail?.activated_at && ACTIVATABLE_STATUSES.includes(byEmail.status)) {
        return NextResponse.json(
          {
            error: 'This BIMED account has already been activated. Please sign in to the Staff Portal instead.',
            code: 'already_activated',
          },
          { status: 409 },
        );
      }

      if (byEmail && ACTIVATABLE_STATUSES.includes(byEmail.status)) {
        return NextResponse.json(
          {
            error: 'This activation link has been replaced by a newer link. Request a new activation link and use the latest email.',
            code: 'activation_replaced',
          },
          { status: 410 },
        );
      }
    }

    return NextResponse.json(
      {
        error: 'This activation link is no longer valid. Request a new activation link or contact BIMED.',
        code: 'activation_invalid',
      },
      { status: 400 },
    );
  }

  if (!ACTIVATABLE_STATUSES.includes(staff.status)) {
    return NextResponse.json(
      { error: 'This BIMED staff account is not currently eligible for activation. Please contact BIMED.', code: 'account_unavailable' },
      { status: 409 },
    );
  }

  if (staff.activated_at) {
    return NextResponse.json(
      {
        error: 'This BIMED account has already been activated. Please sign in to the Staff Portal instead.',
        code: 'already_activated',
      },
      { status: 409 },
    );
  }

  if (email && email !== String(staff.email).trim().toLowerCase()) {
    return NextResponse.json(
      {
        error: 'The email entered does not match the BIMED email attached to this activation link. Use the BIMED email shown on the activation page.',
        code: 'email_mismatch',
      },
      { status: 400 },
    );
  }

  if (!staff.activation_expires_at || new Date(staff.activation_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      {
        error: 'This activation link has expired. Request a new activation link and BIMED will email the latest link to the address used during your recruitment.',
        code: 'activation_expired',
      },
      { status: 410 },
    );
  }

  const passwordHash = hashStaffPassword(password);
  const nextSessionVersion = Math.max(Number(staff.session_version) || 1, 1) + 1;

  const { data: updated, error: updateError } = await client
    .from('recruitment_staff')
    .update({
      password_hash: passwordHash,
      activation_token_hash: null,
      activation_expires_at: null,
      activated_at: new Date().toISOString(),
      session_version: nextSessionVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', staff.id)
    .select('id,bimed_id,email,status,session_version')
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Unable to activate the staff account.', code: 'activation_error' }, { status: 500 });
  }

  await createStaffAudit(client, {
    staffId: staff.id,
    actor: staff.email,
    eventType: 'staff_account_activated',
  });

  const response = NextResponse.json({ ok: true, staff: updated });
  const sessionToken = createStaffSessionToken({
    staff_id: updated.id,
    bimed_id: updated.bimed_id,
    email: updated.email,
    session_version: updated.session_version,
  });
  setStaffSessionCookie(response, sessionToken);
  return response;
}
