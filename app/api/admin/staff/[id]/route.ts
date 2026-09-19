import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit } from '@/lib/staff';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await context.params;
  const client = db();
  const { data: staff, error } = await client.from('recruitment_staff').select('*').eq('id', id).single();
  if (error || !staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  let profilePhotoUrl: string | null = null;
  if (staff.profile_photo_path) {
    const { data } = await client.storage.from('bimed-staff-photos').createSignedUrl(staff.profile_photo_path, 15 * 60);
    profilePhotoUrl = data?.signedUrl || null;
  }

  const [shiftsResult, attendanceResult, leaveResult, payslipsResult, auditResult] = await Promise.all([
    client.from('recruitment_workforce_shifts').select('*').eq('staff_id', id).order('shift_date', { ascending: false }).order('start_at', { ascending: false }).limit(50),
    client.from('recruitment_staff_attendance').select('id,shift_id,clock_in_at,clock_out_at,break_minutes,status,notes,approved_by,approved_at,created_at,updated_at,shift:recruitment_workforce_shifts(id,shift_date,start_at,end_at,shift_type,role,location,status)').eq('staff_id', id).order('created_at', { ascending: false }).limit(100),
    client.from('recruitment_leave_requests').select('*').eq('staff_id', id).order('start_date', { ascending: false }).limit(50),
    client.from('recruitment_staff_payslips').select('*').eq('staff_id', id).order('pay_period_end', { ascending: false }).limit(24),
    client.from('recruitment_staff_audit_log').select('*').eq('staff_id', id).order('created_at', { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    staff: { ...staff, profile_photo_url: profilePhotoUrl },
    shifts: shiftsResult.data || [],
    attendance: attendanceResult.data || [],
    leaveRequests: leaveResult.data || [],
    payslips: payslipsResult.data || [],
    auditLog: auditResult.data || [],
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await context.params;
  let body: { action?: 'rotate_activation' };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (body.action !== 'rotate_activation') return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });

  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,email,bimed_id').eq('id', id).single();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client.from('recruitment_staff').update({ activation_token_hash: hash, activation_expires_at: expires, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Unable to rotate activation link.' }, { status: 500 });

  await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'staff_activation_rotated' });
  const origin = new URL(request.url).origin;
  return NextResponse.json({ activationUrl: `${origin}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(staff.email)}`, bimedId: staff.bimed_id });
}
