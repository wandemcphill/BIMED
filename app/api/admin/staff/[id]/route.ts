import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';

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

  return NextResponse.json({ staff: { ...staff, profile_photo_url: profilePhotoUrl } });
}
