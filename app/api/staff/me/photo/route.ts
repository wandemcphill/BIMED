import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';
import { STAFF_PHOTO_BUCKET } from '@/lib/staff';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return new NextResponse('Unauthorised', { status: 401 });

  const client = db();
  const { data: staff, error: staffError } = await client
    .from('recruitment_staff')
    .select('profile_photo_path')
    .eq('id', session.staff_id)
    .single();

  if (staffError || !staff?.profile_photo_path) return new NextResponse('Photograph not found.', { status: 404 });

  const { data, error } = await client.storage.from(STAFF_PHOTO_BUCKET).download(staff.profile_photo_path);
  if (error || !data) return new NextResponse('Unable to load photograph.', { status: 404 });

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
