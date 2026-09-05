import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';

// Narrow-column scan (just the two fields needed) so this stays cheap even at 10k+ applications -
// the dashboard uses this for status tab counts and the international/Ireland split, instead of
// computing them client-side from a page of results that no longer holds the whole dataset.
export async function GET(request: NextRequest) {
  if (!await getAdminSession(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { data, error } = await db().from('recruitment_applications').select('status, living_in_ireland');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statusCounts: Record<string, number> = {};
  let international = 0;
  let ireland = 0;

  for (const row of data || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    if (row.living_in_ireland === 'No') international += 1;
    else ireland += 1;
  }

  return NextResponse.json({ statusCounts, total: data?.length || 0, international, ireland });
}
