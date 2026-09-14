import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashStaffPassword, createStaffSessionToken, hashActivationToken, setStaffSessionCookie } from '@/lib/staff-auth';
import { createStaffAudit } from '@/lib/staff';

export async function POST(request: NextRequest) {
  const limiter = await checkRateLimit({ key: 'staff-activation', limit: 6, windowMs: 15 * 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'Too many activation attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });

  let body: { token?: string; email?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const token = body.token?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password || '';
  if (!token || !email || password.length < 10) return NextResponse.json({ error: 'A valid activation token, email and password of at least 10 characters are required.' }, { status: 400 });

  const client = db();
  const tokenHash = hashActivationToken(token);
  const { data: staff, error } = await client.from('recruitment_staff').select('id,bimed_id,email,status,session_version,activation_expires_at').eq('email', email).eq('activation_token_hash', tokenHash).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to activate this account.' }, { status: 500 });
  if (!staff || !['active', 'pre_arrival', 'on_leave'].includes(staff.status) || !staff.activation_expires_at || new Date(staff.activation_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This activation link is invalid or has expired. Ask BIMED to issue a new activation link.' }, { status: 400 });
  }

  const passwordHash = hashStaffPassword(password);
  const nextSessionVersion = Math.max(Number(staff.session_version) || 1, 1) + 1;
  const { data: updated, error: updateError } = await client.from('recruitment_staff').update({
    password_hash: passwordHash,
    activation_token_hash: null,
    activation_expires_at: null,
    activated_at: new Date().toISOString(),
    session_version: nextSessionVersion,
    updated_at: new Date().toISOString(),
  }).eq('id', staff.id).select('id,bimed_id,email,status,session_version').single();
  if (updateError || !updated) return NextResponse.json({ error: 'Unable to activate the staff account.' }, { status: 500 });

  await createStaffAudit(client, { staffId: staff.id, actor: staff.email, eventType: 'staff_account_activated' });
  const response = NextResponse.json({ ok: true, staff: updated });
  const sessionToken = createStaffSessionToken({ staff_id: updated.id, bimed_id: updated.bimed_id, email: updated.email, session_version: updated.session_version });
  setStaffSessionCookie(response, sessionToken);
  return response;
}
