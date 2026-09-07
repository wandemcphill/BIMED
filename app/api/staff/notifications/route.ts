import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data, error } = await client.from('recruitment_staff_notifications').select('*').eq('staff_id', session.staff_id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load notifications.' }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: { id?: string; all?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const client = db();
  const now = new Date().toISOString();
  if (body.all) {
    const { error } = await client.from('recruitment_staff_notifications').update({ read_at: now }).eq('staff_id', session.staff_id).is('read_at', null);
    if (error) return NextResponse.json({ error: 'Unable to mark notifications as read.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await client.from('recruitment_staff_notifications').update({ read_at: now }).eq('id', body.id).eq('staff_id', session.staff_id);
  if (error) return NextResponse.json({ error: 'Unable to mark notification as read.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
