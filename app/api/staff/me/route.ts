import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';
import { createStaffAudit, STAFF_PHOTO_BUCKET, hashOneTimePhotoName } from '@/lib/staff';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function withPhotoUrl(client: ReturnType<typeof db>, staff: Record<string, unknown>) {
  if (!staff.profile_photo_path) return staff;
  const { data } = await client.storage.from(STAFF_PHOTO_BUCKET).createSignedUrl(String(staff.profile_photo_path), 15 * 60);
  return { ...staff, profile_photo_url: data?.signedUrl || null };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff, error } = await client.from('recruitment_staff').select('*').eq('id', session.staff_id).single();
  if (error || !staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  return NextResponse.json({ staff: await withPhotoUrl(client, staff) });
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const editable = ['preferred_name','phone','address_line_1','address_line_2','city','county','eircode','pps_number','pps_status','tax_status','revenue_reference','bank_name','bank_account_name','iban','bic','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone'];
  const update: Record<string, unknown> = {};
  for (const key of editable) if (key in body) update[key] = typeof body[key] === 'string' ? String(body[key]).trim() : body[key];
  if ('pps_number' in update) update.pps_status = update.pps_number ? 'submitted' : 'pending';
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const client = db();
  const { data, error } = await client.from('recruitment_staff').update(update).eq('id', session.staff_id).select('*').single();
  if (error || !data) return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 });
  await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'staff_self_service_profile_updated', metadata: { fields: Object.keys(update).filter(k => k !== 'updated_at') } });
  return NextResponse.json({ staff: await withPhotoUrl(client, data) });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A photograph is required.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photograph.' }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'Photograph must be 5 MB or smaller.' }, { status: 400 });

  const client = db();
  const { data: current } = await client.from('recruitment_staff').select('profile_photo_path').eq('id', session.staff_id).single();
  const path = hashOneTimePhotoName(session.staff_id, file.name || 'staff-photo');
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await client.storage.from(STAFF_PHOTO_BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });
  const { data, error } = await client.from('recruitment_staff').update({ profile_photo_path: path, profile_photo_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', session.staff_id).select('*').single();
  if (error || !data) return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });
  if (current?.profile_photo_path) await client.storage.from(STAFF_PHOTO_BUCKET).remove([current.profile_photo_path]);
  await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'staff_photo_updated' });
  return NextResponse.json({ staff: await withPhotoUrl(client, data) });
}
