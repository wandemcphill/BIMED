import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const client = db();

  let shiftQuery = client.from('recruitment_workforce_shifts').select('*').eq('staff_id', session.staff_id).order('shift_date', { ascending: true }).order('start_at', { ascending: true }).limit(200);
  if (from) shiftQuery = shiftQuery.gte('shift_date', from);
  if (to) shiftQuery = shiftQuery.lte('shift_date', to);
  const [{ data: shifts, error: shiftError }, { data: requests, error: requestError }] = await Promise.all([
    shiftQuery,
    client.from('recruitment_shift_requests').select('*,shift:recruitment_workforce_shifts(*)').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(200),
  ]);
  if (shiftError || requestError) return NextResponse.json({ error: 'Unable to load your rota.' }, { status: 500 });
  return NextResponse.json({ shifts: shifts || [], requests: requests || [] });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { action?: string; shiftId?: string; requestId?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const client = db();

  if (body.action === 'request_shift') {
    if (!body.shiftId) return NextResponse.json({ error: 'shiftId is required.' }, { status: 400 });
    const { data: shift } = await client.from('recruitment_workforce_shifts').select('*').eq('id', body.shiftId).single();
    if (!shift || shift.status !== 'available') return NextResponse.json({ error: 'This shift is no longer available.' }, { status: 409 });
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
    const { data: shift } = await client.from('recruitment_workforce_shifts').select('id,status').eq('id', body.shiftId).eq('staff_id', session.staff_id).single();
    if (!shift || !['assigned', 'confirmed'].includes(shift.status)) return NextResponse.json({ error: 'This shift is not eligible for cancellation.' }, { status: 409 });
    const { data, error } = await client.from('recruitment_shift_requests').insert({ shift_id: body.shiftId, staff_id: session.staff_id, request_type: 'cancellation', reason: (body.reason || '').trim() || 'Staff requested cancellation.' }).select('*').single();
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'A cancellation request is already open for this shift.' : 'Unable to submit cancellation request.' }, { status: error.code === '23505' ? 409 : 500 });
    await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'shift_cancellation_requested', metadata: { shift_id: body.shiftId, request_id: data.id } });
    return NextResponse.json({ request: data }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
