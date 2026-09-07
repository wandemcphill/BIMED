import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit, createStaffFromApplication } from '@/lib/staff';

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search')?.trim();

  let query = client
    .from('recruitment_staff')
    .select('id,bimed_id,status,full_name,preferred_name,email,phone,role,department,employment_type,employment_start_date,primary_location,pps_number,pps_status,tax_status,profile_photo_path,activated_at,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(250);
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,bimed_id.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load staff.' }, { status: 500 });

  return NextResponse.json({ staff: data || [] });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: { action?: string; applicationId?: string; staffId?: string; status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const client = db();
  try {
    if (body.action === 'promote') {
      if (!body.applicationId) return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 });
      const result = await createStaffFromApplication(client, body.applicationId);
      await createStaffAudit(client, { staffId: result.staff.id, actor: session.email, eventType: 'staff_identity_created', metadata: { application_id: body.applicationId } });
      const origin = new URL(request.url).origin;
      const activationUrl = result.activationToken ? `${origin}/staff/activate?token=${encodeURIComponent(result.activationToken)}&email=${encodeURIComponent(result.staff.email)}` : null;
      return NextResponse.json({ staff: result.staff, activationUrl });
    }

    if (body.action === 'status') {
      const allowed = ['pre_arrival', 'active', 'on_leave', 'suspended', 'former'];
      if (!body.staffId || !body.status || !allowed.includes(body.status)) return NextResponse.json({ error: 'Valid staffId and status are required.' }, { status: 400 });
      const { data, error } = await client.from('recruitment_staff').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.staffId).select('*').single();
      if (error || !data) return NextResponse.json({ error: 'Unable to update staff status.' }, { status: 500 });
      await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'staff_status_changed', metadata: { status: body.status } });
      return NextResponse.json({ staff: data });
    }

    if (body.action === 'rotate_activation') {
      if (!body.staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await client.from('recruitment_staff').update({ activation_token_hash: hash, activation_expires_at: expires, updated_at: new Date().toISOString() }).eq('id', body.staffId).select('id,email,bimed_id').single();
      if (error || !data) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
      await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'staff_activation_rotated' });
      const origin = new URL(request.url).origin;
      return NextResponse.json({ activationUrl: `${origin}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}` });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff_admin_api_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to complete the staff action.' }, { status: 500 });
  }
}
