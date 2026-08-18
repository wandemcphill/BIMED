import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequestAuthenticated } from '@/lib/admin-session';

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { data, error } = await db().from('recruitment_applications').select('*').order('submitted_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applications: data || [] });
}
