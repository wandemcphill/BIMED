import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { createStaffSessionToken, setStaffSessionCookie, verifyStaffPassword } from '@/lib/staff-auth';

export async function POST(request: NextRequest) {
  let body: { identifier?: string; email?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const identifier = (body.identifier || body.email || '').trim(); const password = body.password || '';
  if (!identifier || !password) return NextResponse.json({ error: 'Enter your BIMED ID or BIMED email and password.' }, { status: 400 });
  const isEmail = identifier.includes('@'); const lookup = identifier.toLowerCase(); const normalizedId = isEmail ? lookup : identifier.toUpperCase();
  const ipLimit = await checkRateLimit({ key: 'staff-login-ip', limit: 20, windowMs: 15 * 60 * 1000, request }); const identityLimit = await checkRateLimit({ key: `staff-login-identity:${normalizedId}`, limit: 8, windowMs: 15 * 60 * 1000, request });
  if (!ipLimit.allowed || !identityLimit.allowed) { const retryAfter = Math.max(ipLimit.retryAfterSeconds || 60, identityLimit.retryAfterSeconds || 60); return NextResponse.json({ error: 'Too many sign-in attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } }); }

  const client = db();
  const query = client.from('recruitment_staff').select('id,bimed_id,email,status,password_hash,session_version,portal_restriction_reason,portal_restriction_message');
  const { data: staff, error } = await (isEmail ? query.eq('email', lookup) : query.eq('bimed_id', normalizedId)).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to sign in right now.' }, { status: 500 });
  if (!staff || !staff.password_hash || !verifyStaffPassword(password, staff.password_hash)) return NextResponse.json({ error: 'The BIMED ID/email or password is incorrect.' }, { status: 401 });
  if (staff.status === 'suspended' && staff.portal_restriction_reason === 'accommodation_nonpayment') return NextResponse.json({ error: staff.portal_restriction_message || 'Your BIMED Staff Portal access is temporarily restricted because the required accommodation contribution has not been paid. Please contact BIMED if you need clarification.', code: 'PORTAL_RESTRICTED', restrictedReason: 'accommodation_nonpayment' }, { status: 403 });
  if (!['active', 'pre_arrival', 'on_leave'].includes(staff.status)) return NextResponse.json({ error: 'This Staff Portal account is currently unavailable. Please contact BIMED for assistance.' }, { status: 403 });

  await client.from('recruitment_staff').update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', staff.id);
  const response = NextResponse.json({ ok: true, staff: { id: staff.id, bimed_id: staff.bimed_id, email: staff.email, status: staff.status } });
  setStaffSessionCookie(response, createStaffSessionToken({ staff_id: staff.id, bimed_id: staff.bimed_id, email: staff.email, session_version: staff.session_version })); return response;
}
