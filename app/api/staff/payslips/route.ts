import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data, error } = await client.from('recruitment_staff_payslips').select('*').eq('staff_id', session.staff_id).order('pay_period_end', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: 'Unable to load your payslips.' }, { status: 500 });
  return NextResponse.json({ payslips: data || [] });
}
