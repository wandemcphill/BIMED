import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';
import { createStaffAudit } from '@/lib/staff';
import { isValidAttendanceWindow, isValidBreakMinutes } from '@/lib/attendance';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const now = new Date().toISOString();
  const { data: shifts, error: shiftError } = await client
    .from('recruitment_workforce_shifts')
    .select('id,shift_date,start_at,end_at,shift_type,role,location,status')
    .eq('staff_id', session.staff_id)
    .in('status', ['assigned', 'confirmed'])
    .gte('end_at', now)
    .order('start_at', { ascending: true })
    .limit(30);

  const { data: attendance, error: attendanceError } = await client
    .from('recruitment_staff_attendance')
    .select('*,shift:recruitment_workforce_shifts(id,shift_date,start_at,end_at,shift_type,role,location,status)')
    .eq('staff_id', session.staff_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (shiftError || attendanceError) return NextResponse.json({ error: 'Unable to load your time and attendance.' }, { status: 500 });
  return NextResponse.json({ shifts: shifts || [], attendance: attendance || [] });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: { action?: string; shiftId?: string; breakMinutes?: number; notes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body.shiftId) return NextResponse.json({ error: 'shiftId is required.' }, { status: 400 });

  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,status').eq('id', session.staff_id).single();
  if (!staff || staff.status !== 'active') return NextResponse.json({ error: 'Only active BIMED staff can clock attendance.' }, { status: 403 });

  const { data: shift } = await client
    .from('recruitment_workforce_shifts')
    .select('id,staff_id,start_at,end_at,status,shift_date,shift_type')
    .eq('id', body.shiftId)
    .eq('staff_id', session.staff_id)
    .single();
  if (!shift || !['assigned', 'confirmed'].includes(shift.status)) return NextResponse.json({ error: 'This shift is not eligible for attendance.' }, { status: 409 });

  if (body.action === 'clock_in') {
    if (!isValidAttendanceWindow(shift.start_at, shift.end_at)) return NextResponse.json({ error: 'Clock-in is available from 2 hours before the shift until the scheduled finish.' }, { status: 409 });
    const { data: existing } = await client.from('recruitment_staff_attendance').select('*').eq('staff_id', session.staff_id).eq('shift_id', shift.id).maybeSingle();
    if (existing?.clock_in_at) return NextResponse.json({ error: 'You are already clocked in for this shift.' }, { status: 409 });
    const { data, error } = await client
      .from('recruitment_staff_attendance')
      .insert({ staff_id: session.staff_id, shift_id: shift.id, clock_in_at: new Date().toISOString(), status: 'open' })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Attendance already exists for this shift.' : 'Unable to clock in.' }, { status: error.code === '23505' ? 409 : 500 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'attendance_clock_in', metadata: { shift_id: shift.id, attendance_id: data.id } });
    return NextResponse.json({ attendance: data }, { status: 201 });
  }

  if (body.action === 'clock_out') {
    const { data: existing } = await client.from('recruitment_staff_attendance').select('*').eq('staff_id', session.staff_id).eq('shift_id', shift.id).maybeSingle();
    if (!existing?.clock_in_at) return NextResponse.json({ error: 'You must clock in before clocking out.' }, { status: 409 });
    if (existing.clock_out_at) return NextResponse.json({ error: 'You are already clocked out for this shift.' }, { status: 409 });
    const breakMinutes = body.breakMinutes ?? existing.break_minutes ?? 0;
    if (!isValidBreakMinutes(breakMinutes)) return NextResponse.json({ error: 'Break minutes must be a whole number between 0 and 720.' }, { status: 400 });
    const clockOut = new Date().toISOString();
    if (new Date(clockOut).getTime() <= new Date(existing.clock_in_at).getTime()) return NextResponse.json({ error: 'Clock-out time must be after clock-in time.' }, { status: 409 });
    const { data, error } = await client
      .from('recruitment_staff_attendance')
      .update({ clock_out_at: clockOut, break_minutes: breakMinutes, notes: (body.notes || '').trim() || existing.notes || null, status: 'submitted', updated_at: clockOut })
      .eq('id', existing.id)
      .eq('staff_id', session.staff_id)
      .is('clock_out_at', null)
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: 'Unable to clock out. The record may already have been updated.' }, { status: 409 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'attendance_clock_out', metadata: { shift_id: shift.id, attendance_id: data.id, break_minutes: breakMinutes } });
    return NextResponse.json({ attendance: data });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
