import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createStaffSessionToken, setStaffSessionCookie, verifyStaffPassword } from '@/lib/staff-auth';

export async function POST(request: NextRequest) {
  let body: { identifier?: string; email?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const identifier = (body.identifier || body.email || '').trim();
  const password = body.password || '';
  if (!identifier || !password) return NextResponse.json({ error: 'Enter your BIMED ID or BIMED email and password.' }, { status: 400 });

  const client = db();
  const isEmail = identifier.includes('@');
  const lookup = identifier.toLowerCase();
  const query = client.from('recruitment_staff').select('id,bimed_id,email,status,password_hash,session_version');
  const { data: staff, error } = await (isEmail ? query.eq('email', lookup) : query.eq('bimed_id', identifier.toUpperCase())).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to sign in right now.' }, { status: 500 });
  if (!staff || !staff.password_hash || staff.status === 'suspended' || !verifyStaffPassword(password, staff.password_hash)) {
    return NextResponse.json({ error: 'The BIMED ID/email or password is incorrect.' }, { status: 401 });
  }

  await client.from('recruitment_staff').update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', staff.id);
  const response = NextResponse.json({ ok: true, staff: { id: staff.id, bimed_id: staff.bimed_id, email: staff.email, status: staff.status } });
  setStaffSessionCookie(response, createStaffSessionToken({ staff_id: staff.id, bimed_id: staff.bimed_id, email: staff.email, session_version: staff.session_version }));
  return response;
}
