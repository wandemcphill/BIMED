import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStaffSession } from '@/lib/staff-auth';
import { createStaffAudit, STAFF_PHOTO_BUCKET, hashOneTimePhotoName } from '@/lib/staff';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SAFE_PROFILE_FIELDS = 'id,bimed_id,application_id,full_name,preferred_name,email,status,role,job_title,department,employment_type,employment_start_date,manager_name,primary_location,phone,address_line_1,address_line_2,city,county,eircode,country,pps_number,pps_status,profile_photo_path,profile_photo_updated_at,department_namespace,portal_handle,portal_address,activated_at,last_login_at';

async function withPhotoUrl(client: ReturnType<typeof db>, staff: Record<string, unknown>) {
  if (!staff.profile_photo_path) return staff;
  const { data } = await client.storage.from(STAFF_PHOTO_BUCKET).createSignedUrl(String(staff.profile_photo_path), 15 * 60);
  return { ...staff, profile_photo_url: data?.signedUrl || null };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff, error } = await client.from('recruitment_staff').select(SAFE_PROFILE_FIELDS).eq('id', session.staff_id).single();
  if (error || !staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  return NextResponse.json({ staff: await withPhotoUrl(client, staff) });
}

export async function PATCH(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `staff-profile-update:${session.staff_id}`, limit: 20, windowMs: 10 * 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'Too many profile updates. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const editable = ['preferred_name','phone','address_line_1','address_line_2','city','county','eircode','pps_number','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone'];
  const update: Record<string, unknown> = {};
  for (const key of editable) if (key in body) update[key] = typeof body[key] === 'string' ? String(body[key]).trim() : body[key];
  if ('pps_number' in update) update.pps_status = update.pps_number ? 'submitted' : 'pending';
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No editable fields supplied.' }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const client = db();
  const { data, error } = await client.from('recruitment_staff').update(update).eq('id', session.staff_id).select(SAFE_PROFILE_FIELDS).single();
  if (error || !data) return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 });
  await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'staff_self_service_profile_updated', metadata: { fields: Object.keys(update).filter(k => k !== 'updated_at') } });
  return NextResponse.json({ staff: await withPhotoUrl(client, data) });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `staff-profile-photo:${session.staff_id}`, limit: 6, windowMs: 60 * 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'Too many photograph uploads. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });
  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'A photograph is required.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photograph.' }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'Photograph must be between 1 byte and 5 MB.' }, { status: 400 });

  const client = db();
  const { data: current } = await client.from('recruitment_staff').select('profile_photo_path').eq('id', session.staff_id).single();
  const path = hashOneTimePhotoName(session.staff_id, file.name || 'staff-photo');
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await client.storage.from(STAFF_PHOTO_BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });
  const { data, error } = await client.from('recruitment_staff').update({ profile_photo_path: path, profile_photo_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', session.staff_id).select(SAFE_PROFILE_FIELDS).single();
  if (error || !data) return NextResponse.json({ error: 'Unable to save the photograph.' }, { status: 500 });
  if (current?.profile_photo_path) await client.storage.from(STAFF_PHOTO_BUCKET).remove([current.profile_photo_path]);
  await createStaffAudit(client, { staffId: session.staff_id, actor: session.email, eventType: 'staff_photo_updated' });
  return NextResponse.json({ staff: await withPhotoUrl(client, data) });
}
