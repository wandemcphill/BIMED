import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status');
  const client = db();
  let query = client.from('recruitment_workforce_shifts').select('*,staff:recruitment_staff(id,bimed_id,full_name,preferred_name,role,primary_location,profile_photo_path)').order('shift_date', { ascending: true }).order('start_at', { ascending: true }).limit(500);
  if (from) query = query.gte('shift_date', from);
  if (to) query = query.lte('shift_date', to);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load rota.' }, { status: 500 });
  const { data: requests, error: requestError } = await client.from('recruitment_shift_requests').select('*,staff:recruitment_staff(id,bimed_id,full_name,preferred_name,role),shift:recruitment_workforce_shifts(*)').eq('status', 'pending').order('created_at', { ascending: true }).limit(250);
  if (requestError) return NextResponse.json({ error: 'Unable to load shift requests.' }, { status: 500 });
  return NextResponse.json({ shifts: data || [], pendingRequests: requests || [] });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { action?: string; shiftId?: string; staffId?: string | null; shiftDate?: string; startAt?: string; endAt?: string; shiftType?: string; role?: string; location?: string; breakMinutes?: number; notes?: string; requestId?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const client = db();

  if (body.action === 'create') {
    if (!body.shiftDate || !body.startAt || !body.endAt || !body.shiftType) return NextResponse.json({ error: 'shiftDate, startAt, endAt and shiftType are required.' }, { status: 400 });
    const { data, error } = await client.from('recruitment_workforce_shifts').insert({
      shift_date: body.shiftDate, start_at: body.startAt, end_at: body.endAt, shift_type: body.shiftType,
      staff_id: body.staffId || null, role: body.role || null, location: body.location || null,
      break_minutes: Math.max(0, Number(body.breakMinutes || 0)), status: body.staffId ? 'assigned' : 'available',
      created_by: session.email, assigned_at: body.staffId ? new Date().toISOString() : null, notes: body.notes || null,
    }).select('*,staff:recruitment_staff(id,bimed_id,full_name)').single();
    if (error || !data) return NextResponse.json({ error: 'Unable to create shift.' }, { status: 500 });
    if (body.staffId) await createStaffNotification(client, { staffId: body.staffId, category: 'rota', title: 'New shift assigned', body: `You have been assigned a ${body.shiftType} shift on ${body.shiftDate}.`, actionUrl: '/staff/rota' });
    await createStaffAudit(client, { staffId: body.staffId || null, actor: session.email, eventType: 'shift_created', metadata: { shift_id: data.id, assigned: Boolean(body.staffId) } });
    return NextResponse.json({ shift: data }, { status: 201 });
  }

  if (body.action === 'assign') {
    if (!body.shiftId || !body.staffId) return NextResponse.json({ error: 'shiftId and staffId are required.' }, { status: 400 });
    const { data, error } = await client.from('recruitment_workforce_shifts').update({ staff_id: body.staffId, status: 'assigned', assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.shiftId).select('*').single();
    if (error || !data) return NextResponse.json({ error: 'Unable to assign shift.' }, { status: 500 });
    await createStaffNotification(client, { staffId: body.staffId, category: 'rota', title: 'Shift assigned', body: `A new shift has been added to your BIMED rota for ${data.shift_date}.`, actionUrl: '/staff/rota' });
    await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'shift_assigned', metadata: { shift_id: body.shiftId } });
    return NextResponse.json({ shift: data });
  }

  if (body.action === 'cancel') {
    if (!body.shiftId) return NextResponse.json({ error: 'shiftId is required.' }, { status: 400 });
    const { data: shift } = await client.from('recruitment_workforce_shifts').select('*').eq('id', body.shiftId).single();
    if (!shift) return NextResponse.json({ error: 'Shift not found.' }, { status: 404 });
    const { data, error } = await client.from('recruitment_workforce_shifts').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: body.reason || 'Cancelled by BIMED.', updated_at: new Date().toISOString() }).eq('id', body.shiftId).select('*').single();
    if (error || !data) return NextResponse.json({ error: 'Unable to cancel shift.' }, { status: 500 });
    if (shift.staff_id) await createStaffNotification(client, { staffId: shift.staff_id, category: 'rota', title: 'Shift cancelled', body: `Your ${shift.shift_type} shift on ${shift.shift_date} has been cancelled.`, actionUrl: '/staff/rota' });
    return NextResponse.json({ shift: data });
  }

  if (body.action === 'request_response') {
    if (!body.requestId || !['approve','decline'].includes(body.reason || '')) return NextResponse.json({ error: 'requestId and reason=approve|decline are required.' }, { status: 400 });
    const approved = body.reason === 'approve';
    const { data: requestRow } = await client.from('recruitment_shift_requests').select('*,shift:recruitment_workforce_shifts(*)').eq('id', body.requestId).single();
    if (!requestRow || requestRow.status !== 'pending') return NextResponse.json({ error: 'This request is no longer pending.' }, { status: 409 });
    const { data: updated, error } = await client.from('recruitment_shift_requests').update({ status: approved ? 'approved' : 'declined', responded_by: session.email, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.requestId).select('*').single();
    if (error || !updated) return NextResponse.json({ error: 'Unable to respond to request.' }, { status: 500 });
    if (approved && requestRow.request_type === 'shift') {
      await client.from('recruitment_workforce_shifts').update({ staff_id: requestRow.staff_id, status: 'assigned', assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', requestRow.shift_id).eq('status', 'available');
    }
    await createStaffNotification(client, { staffId: requestRow.staff_id, category: 'rota', title: approved ? 'Shift request approved' : 'Shift request declined', body: approved ? 'Your shift request has been approved and added to your rota.' : 'Your shift request has been declined.', actionUrl: '/staff/rota' });
    await createStaffAudit(client, { staffId: requestRow.staff_id, actor: session.email, eventType: `shift_request_${approved ? 'approved' : 'declined'}`, metadata: { request_id: body.requestId, request_type: requestRow.request_type } });
    return NextResponse.json({ request: updated });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
