import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

async function getShiftEligibility(client: ReturnType<typeof db>, staffId: string) {
  const [{ data: staff }, { data: permit }] = await Promise.all([
    client.from('recruitment_staff').select('status').eq('id', staffId).maybeSingle(),
    client.from('recruitment_staff_permit_cases').select('work_authorised,shift_eligibility').eq('staff_id', staffId).maybeSingle(),
  ]);
  if (!staff) return { eligible: false, reason: 'Your BIMED staff record could not be found.' };
  if (staff.status !== 'active') return { eligible: false, reason: 'Shift requests are available only to active BIMED staff. Your Staff Portal remains available for the functions appropriate to your current status.' };
  if (!permit) return { eligible: true, reason: null as string | null };
  if (permit.shift_eligibility !== 'eligible' || !permit.work_authorised) return { eligible: false, reason: 'Your overseas employment permit/work-authorisation journey is not yet complete. Staff Portal access is available for onboarding, but shifts remain blocked until BIMED confirms your right to work.' };
  return { eligible: true, reason: null as string | null };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const swapFor = url.searchParams.get('swap_for');
  const client = db();

  let assignedQuery = client.from('recruitment_workforce_shifts').select('*').eq('staff_id', session.staff_id).order('shift_date', { ascending: true }).order('start_at', { ascending: true }).limit(200);
  let availableQuery = client.from('recruitment_workforce_shifts').select('*').eq('status', 'available').order('shift_date', { ascending: true }).order('start_at', { ascending: true }).limit(200);
  let leaveQuery = client.from('recruitment_leave_requests').select('*').eq('staff_id', session.staff_id).order('start_date', { ascending: false }).limit(100);
  if (from) { assignedQuery = assignedQuery.gte('shift_date', from); availableQuery = availableQuery.gte('shift_date', from); }
  if (to) { assignedQuery = assignedQuery.lte('shift_date', to); availableQuery = availableQuery.lte('shift_date', to); }

  const [{ data: shifts, error: shiftError }, { data: availableShifts, error: availableError }, { data: requests, error: requestError }, { data: leaveRequests, error: leaveError }] = await Promise.all([
    assignedQuery,
    availableQuery,
    client.from('recruitment_shift_requests').select('*,shift:recruitment_workforce_shifts!recruitment_shift_requests_shift_id_fkey(*),requested_shift:recruitment_workforce_shifts!requested_shift_id(*)').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(200),
    leaveQuery,
  ]);
  if (shiftError || availableError || requestError || leaveError) return NextResponse.json({ error: 'Unable to load your rota.' }, { status: 500 });

  const eligibility = await getShiftEligibility(client, session.staff_id);
  let swapCandidates: any[] = [];
  if (swapFor) {
    if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 403 });
    const { data: ownShift } = await client.from('recruitment_workforce_shifts').select('id,staff_id,status,start_at').eq('id', swapFor).single();
    if (!ownShift || ownShift.staff_id !== session.staff_id || !['assigned', 'confirmed'].includes(ownShift.status) || new Date(ownShift.start_at).getTime() <= Date.now()) return NextResponse.json({ error: 'That shift is not eligible for swapping.' }, { status: 409 });
    const { data, error } = await client.from('recruitment_workforce_shifts').select('id,shift_date,start_at,end_at,shift_type,role,location,status,staff:recruitment_staff(id,bimed_id,full_name,preferred_name,role,profile_photo_path)').neq('staff_id', session.staff_id).in('status', ['assigned', 'confirmed']).gt('start_at', new Date().toISOString()).order('shift_date', { ascending: true }).order('start_at', { ascending: true }).limit(100);
    if (error) return NextResponse.json({ error: 'Unable to load swap options.' }, { status: 500 });
    swapCandidates = data || [];
  }

  return NextResponse.json({ shifts: shifts || [], availableShifts: eligibility.eligible ? (availableShifts || []) : [], requests: requests || [], leaveRequests: leaveRequests || [], swapCandidates, shiftEligibility: eligibility });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { action?: string; shiftId?: string; requestId?: string; requestedShiftId?: string; startDate?: string; endDate?: string; leaveType?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const client = db();
  const eligibility = await getShiftEligibility(client, session.staff_id);

  if (['request_shift','request_cancellation','request_swap','request_leave'].includes(body.action || '') && !eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 403 });

  if (body.action === 'request_shift') {
    if (!body.shiftId) return NextResponse.json({ error: 'shiftId is required.' }, { status: 400 });
    const { data: shift } = await client.from('recruitment_workforce_shifts').select('*').eq('id', body.shiftId).single();
    if (!shift || shift.status !== 'available' || new Date(shift.start_at).getTime() <= Date.now()) return NextResponse.json({ error: 'This shift is no longer available.' }, { status: 409 });
    const { data, error } = await client.from('recruitment_shift_requests').insert({ shift_id: body.shiftId, staff_id: session.staff_id, request_type: 'shift', reason: body.reason || null }).select('*').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'You already requested this shift.' : 'Unable to request this shift.' }, { status: error.code === '23505' ? 409 : 500 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'shift_requested', metadata: { shift_id: body.shiftId } });
    return NextResponse.json({ request: data }, { status: 201 });
  }

  if (body.action === 'cancel_request') {
    if (!body.requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
    const { data, error } = await client.from('recruitment_shift_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', body.requestId).eq('staff_id', session.staff_id).in('status', ['pending']).select('*').single();
    if (error || !data) return NextResponse.json({ error: 'This request cannot be cancelled.' }, { status: 409 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'shift_request_cancelled', metadata: { request_id: body.requestId } });
    return NextResponse.json({ request: data });
  }

  if (body.action === 'request_cancellation') {
    if (!body.shiftId) return NextResponse.json({ error: 'shiftId is required.' }, { status: 400 });
    const { data: shift } = await client.from('recruitment_workforce_shifts').select('id,status,start_at').eq('id', body.shiftId).eq('staff_id', session.staff_id).single();
    if (!shift || !['assigned', 'confirmed'].includes(shift.status)) return NextResponse.json({ error: 'This shift is not eligible for cancellation.' }, { status: 409 });
    if (new Date(shift.start_at).getTime() <= Date.now()) return NextResponse.json({ error: 'A shift that has already started cannot be cancelled from the staff portal.' }, { status: 409 });
    const { data, error } = await client.from('recruitment_shift_requests').insert({ shift_id: body.shiftId, staff_id: session.staff_id, request_type: 'cancellation', reason: (body.reason || '').trim() || 'Staff requested cancellation.' }).select('*').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A cancellation request is already open for this shift.' : 'Unable to submit cancellation request.' }, { status: error.code === '23505' ? 409 : 500 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'shift_cancellation_requested', metadata: { shift_id: body.shiftId, request_id: data.id } });
    return NextResponse.json({ request: data }, { status: 201 });
  }

  if (body.action === 'request_swap') {
    if (!body.shiftId || !body.requestedShiftId || body.shiftId === body.requestedShiftId) return NextResponse.json({ error: 'Choose two different shifts.' }, { status: 400 });
    const { data: first } = await client.from('recruitment_workforce_shifts').select('id,staff_id,status,start_at').eq('id', body.shiftId).single();
    const { data: second } = await client.from('recruitment_workforce_shifts').select('id,staff_id,status,start_at').eq('id', body.requestedShiftId).single();
    if (!first || !second) return NextResponse.json({ error: 'One or both shifts were not found.' }, { status: 404 });
    if (first.staff_id !== session.staff_id) return NextResponse.json({ error: 'You can only initiate a swap from one of your own assigned shifts.' }, { status: 403 });
    if (!second.staff_id || second.staff_id === session.staff_id) return NextResponse.json({ error: 'The requested shift must belong to another staff member.' }, { status: 400 });
    if (!['assigned', 'confirmed'].includes(first.status) || !['assigned', 'confirmed'].includes(second.status)) return NextResponse.json({ error: 'Only assigned or confirmed shifts can be swapped.' }, { status: 409 });
    if (new Date(first.start_at).getTime() <= Date.now() || new Date(second.start_at).getTime() <= Date.now()) return NextResponse.json({ error: 'Past or started shifts cannot be swapped.' }, { status: 409 });
    const { data, error } = await client.from('recruitment_shift_requests').insert({ shift_id: first.id, requested_shift_id: second.id, staff_id: session.staff_id, request_type: 'swap', reason: (body.reason || '').trim() || 'Staff requested a shift swap.' }).select('*').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A swap request is already open for these shifts.' : 'Unable to submit swap request.' }, { status: error.code === '23505' ? 409 : 500 });
    await createStaffNotification(client, { staffId: second.staff_id, category: 'rota', title: 'Shift swap request', body: 'A BIMED colleague has requested to swap a shift with you.', actionUrl: '/staff/rota' });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'shift_swap_requested', metadata: { shift_id: first.id, requested_shift_id: second.id, request_id: data.id } });
    return NextResponse.json({ request: data }, { status: 201 });
  }

  if (body.action === 'request_leave') {
    if (!body.startDate || !body.endDate) return NextResponse.json({ error: 'startDate and endDate are required.' }, { status: 400 });
    if (body.endDate < body.startDate) return NextResponse.json({ error: 'End date cannot be before start date.' }, { status: 400 });
    const { data: atomicResult, error } = await client.rpc('bimed_request_staff_leave', {
      p_staff_id: session.staff_id,
      p_actor: session.email,
      p_start_date: body.startDate,
      p_end_date: body.endDate,
      p_leave_type: (body.leaveType || 'annual').trim(),
      p_reason: (body.reason || '').trim() || null,
    });
    if (error || !atomicResult?.leave_request) {
      const message = error?.message || 'Unable to submit leave request.';
      const status = message.includes('LEAVE_OVERLAP') ? 409 : message.includes('INVALID_LEAVE_DATE_RANGE') ? 400 : message.includes('STAFF_NOT_ELIGIBLE_FOR_LEAVE') ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ leaveRequest: atomicResult.leave_request }, { status: 201 });
  }

  if (body.action === 'cancel_leave') {
    if (!body.requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
    const { data, error } = await client.from('recruitment_leave_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', body.requestId).eq('staff_id', session.staff_id).eq('status', 'pending').select('*').single();
    if (error || !data) return NextResponse.json({ error: 'This leave request cannot be cancelled.' }, { status: 409 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'leave_request_cancelled', metadata: { leave_request_id: body.requestId } });
    return NextResponse.json({ leaveRequest: data });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
