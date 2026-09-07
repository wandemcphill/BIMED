import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { isValidBreakMinutes } from '@/lib/attendance';

function validIso(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const staffId = url.searchParams.get('staff_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const client = db();

  let query = client
    .from('recruitment_staff_attendance')
    .select('*,staff:recruitment_staff(id,bimed_id,full_name,preferred_name,role),shift:recruitment_workforce_shifts(id,shift_date,start_at,end_at,shift_type,role,location,status)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (status) query = query.eq('status', status);
  if (staffId) query = query.eq('staff_id', staffId);
  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load attendance records.' }, { status: 500 });
  return NextResponse.json({ attendance: data || [] });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { action?: string; attendanceId?: string; clockInAt?: string | null; clockOutAt?: string | null; breakMinutes?: number; notes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body.attendanceId) return NextResponse.json({ error: 'attendanceId is required.' }, { status: 400 });

  const client = db();
  const { data: attendance } = await client.from('recruitment_staff_attendance').select('*').eq('id', body.attendanceId).single();
  if (!attendance) return NextResponse.json({ error: 'Attendance record not found.' }, { status: 404 });

  if (body.action === 'approve' || body.action === 'reject') {
    const approved = body.action === 'approve';
    if (!attendance.clock_in_at || !attendance.clock_out_at) return NextResponse.json({ error: 'Only completed attendance records can be reviewed.' }, { status: 409 });
    const now = new Date().toISOString();
    const { data, error } = await client
      .from('recruitment_staff_attendance')
      .update({ status: approved ? 'approved' : 'rejected', approved_by: session.email, approved_at: approved ? now : null, updated_at: now })
      .eq('id', attendance.id)
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: 'Unable to update attendance status.' }, { status: 500 });
    await createStaffNotification(client, { staffId: attendance.staff_id, category: 'attendance', title: approved ? 'Timesheet approved' : 'Timesheet rejected', body: approved ? 'Your submitted shift attendance has been approved by BIMED.' : 'Your submitted shift attendance needs review. Please contact BIMED if this was unexpected.', actionUrl: '/staff/attendance' });
    await createStaffAudit(client, { staffId: attendance.staff_id, actor: session.email, eventType: `attendance_${approved ? 'approved' : 'rejected'}`, metadata: { attendance_id: attendance.id } });
    return NextResponse.json({ attendance: data });
  }

  if (body.action === 'adjust') {
    if (!validIso(body.clockInAt) || !validIso(body.clockOutAt)) return NextResponse.json({ error: 'Valid clock-in and clock-out timestamps are required.' }, { status: 400 });
    if (new Date(body.clockOutAt!).getTime() <= new Date(body.clockInAt!).getTime()) return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
    const breakMinutes = body.breakMinutes ?? attendance.break_minutes ?? 0;
    if (!isValidBreakMinutes(breakMinutes)) return NextResponse.json({ error: 'Break minutes must be a whole number between 0 and 720.' }, { status: 400 });
    const now = new Date().toISOString();
    const { data, error } = await client
      .from('recruitment_staff_attendance')
      .update({ clock_in_at: body.clockInAt, clock_out_at: body.clockOutAt, break_minutes: breakMinutes, notes: typeof body.notes === 'string' ? body.notes.trim() || null : attendance.notes, status: 'adjusted', approved_by: session.email, approved_at: now, updated_at: now })
      .eq('id', attendance.id)
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: 'Unable to adjust attendance.' }, { status: 500 });
    await createStaffNotification(client, { staffId: attendance.staff_id, category: 'attendance', title: 'Timesheet adjusted', body: 'BIMED has adjusted your attendance record. Review the updated timesheet in your staff portal.', actionUrl: '/staff/attendance' });
    await createStaffAudit(client, { staffId: attendance.staff_id, actor: session.email, eventType: 'attendance_adjusted', metadata: { attendance_id: attendance.id, clock_in_at: body.clockInAt, clock_out_at: body.clockOutAt, break_minutes: breakMinutes } });
    return NextResponse.json({ attendance: data });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
