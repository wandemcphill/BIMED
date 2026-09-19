import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { createStaffAudit } from '@/lib/staff';
import { sendTransactionalEmail } from '@/lib/email/transport';
import { staffPasswordResetEmail } from '@/lib/email/templates';
import { getAppUrl } from '@/lib/email';
import { hashStaffPassword } from '@/lib/staff-auth';

const RESET_TTL_MINUTES = 30;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export async function POST(request: NextRequest) {
  const ipLimit = await checkRateLimit({ key: 'staff-password-reset-ip', limit: 5, windowMs: 15 * 60 * 1000, request });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: true, message: 'If an eligible BIMED Staff Portal account exists for that email, a password reset link will be sent shortly.' },
      { status: 200, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds || 60) } },
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email || '');
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ ok: true, message: 'If an eligible BIMED Staff Portal account exists for that email, a password reset link will be sent shortly.' });
  }

  const client = db();
  const identityLimit = await checkRateLimit({ key: `staff-password-reset-email:${email}`, limit: 3, windowMs: 60 * 60 * 1000, request });
  if (!identityLimit.allowed) {
    return NextResponse.json({ ok: true, message: 'If an eligible BIMED Staff Portal account exists for that email, a password reset link will be sent shortly.' });
  }

  const { data: staff } = await client
    .from('recruitment_staff')
    .select('id,full_name,preferred_name,email,status,activated_at')
    .eq('email', email)
    .maybeSingle();

  if (!staff || !staff.activated_at || !['active', 'pre_arrival', 'on_leave'].includes(staff.status)) {
    return NextResponse.json({ ok: true, message: 'If an eligible BIMED Staff Portal account exists for that email, a password reset link will be sent shortly.' });
  }

  const { token, hash } = createResetToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();

  await client
    .from('recruitment_staff_password_reset_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('staff_id', staff.id)
    .is('consumed_at', null);

  const { error: insertError } = await client
    .from('recruitment_staff_password_reset_tokens')
    .insert({ staff_id: staff.id, token_hash: hash, expires_at: expiresAt });

  if (insertError) {
    return NextResponse.json({ error: 'Unable to create a password reset request right now.' }, { status: 500 });
  }

  const resetUrl = `${getAppUrl()}/staff/password-reset?token=${encodeURIComponent(token)}`;
  const content = staffPasswordResetEmail({
    displayName: staff.preferred_name || staff.full_name,
    resetUrl,
    expiryMinutes: RESET_TTL_MINUTES,
  });

  const delivery = await sendTransactionalEmail({
    to: email,
    content,
    emailType: 'staff_password_reset',
    dedupeKey: `staff_password_reset:${staff.id}:${hash}`,
    client,
    replyTo: 'info@bimedhealthcare.com',
  });

  await createStaffAudit(client, {
    staffId: staff.id,
    actor: 'staff_password_reset_request',
    eventType: 'staff_password_reset_requested',
    metadata: { delivery_status: delivery.status, expires_at: expiresAt },
  });

  return NextResponse.json({
    ok: true,
    message: 'If an eligible BIMED Staff Portal account exists for that email, a password reset link will be sent shortly.',
  });
}

export async function PUT(request: NextRequest) {
  const limiter = await checkRateLimit({ key: 'staff-password-reset-complete', limit: 8, windowMs: 15 * 60 * 1000, request });
  if (!limiter.allowed) {
    return NextResponse.json({ error: 'Too many password reset attempts. Please try again later.' }, { status: 429 });
  }

  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const token = body.token?.trim() || '';
  const password = body.password || '';
  if (!token || password.length < 10) {
    return NextResponse.json({ error: 'A valid reset link and a password of at least 10 characters are required.' }, { status: 400 });
  }

  const client = db();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenLimit = await checkRateLimit({
    key: `staff-password-reset-token:${tokenHash}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
    request,
  });
  if (!tokenLimit.allowed) {
    return NextResponse.json({ error: 'Too many password reset attempts. Please request a new reset link.' }, { status: 429 });
  }

  const result = await client.rpc('bimed_complete_staff_password_reset', {
    p_token_hash: tokenHash,
    p_password_hash: hashStaffPassword(password),
  });

  if (result.error) {
    if (result.error.message?.includes('STAFF_PASSWORD_RESET_INVALID_OR_EXPIRED') || result.error.message?.includes('STAFF_PASSWORD_RESET_ALREADY_USED')) {
      return NextResponse.json({ error: 'This password reset link is invalid or has expired. Request a new reset link.' }, { status: 410 });
    }
    if (result.error.message?.includes('STAFF_PASSWORD_RESET_NOT_ELIGIBLE')) {
      return NextResponse.json({ error: 'This Staff Portal account is not currently eligible for password reset.' }, { status: 409 });
    }
    console.error(JSON.stringify({ level: 'error', event: 'staff.password_reset.complete_failed', reason: result.error.message }));
    return NextResponse.json({ error: 'Unable to update the Staff Portal password.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Your Staff Portal password has been changed. You can now sign in with your BIMED ID or BIMED email.' });
}
