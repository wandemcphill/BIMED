import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { recruitmentStatuses } from '@/lib/recruitment-config';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Strips characters that would otherwise break PostgREST's .or() filter syntax (comma and
// parentheses are structural there) before it's used in an ilike search.
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()%]/g, '').trim().slice(0, 200);
}

export async function GET(request: NextRequest) {
  if (!await getAdminSession(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const q = sanitizeSearchTerm(searchParams.get('q') || '');
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  let query = db()
    .from('recruitment_applications')
    .select('id, full_name, email, role_applied, country_of_residence, living_in_ireland, status, submitted_at', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all' && (recruitmentStatuses as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data || [], total: count ?? 0 });
}
