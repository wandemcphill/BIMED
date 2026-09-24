import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { restrictRecruitmentStaffPortal, reactivateRecruitmentStaffPortal } from '@/lib/staff-portal-workflow';

export const dynamic = 'force-dynamic';

const TARGETS = new Set([
  'b97068f5-44c6-45bc-9394-bb17ffc615bd',
  'efbd6384-acda-40d5-9d13-85557f2e53cc',
]);

export async function GET(request: NextRequest) {
  const expected = process.env.BIMED_PORTAL_REPLAY_SECRET?.trim() || '';
  const supplied = new URL(request.url).searchParams.get('secret')?.trim() || '';
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const client = db();
  const results: unknown[] = [];

  for (const staffId of TARGETS) {
    const { data: staff, error: lookupError } = await client
      .from('recruitment_staff')
      .select('id,full_name,email,status,portal_restriction_reason,portal_restriction_message')
      .eq('id', staffId)
      .single();

    if (lookupError || !staff) {
      results.push({ staffId, error: lookupError?.message || 'Staff record not found.' });
      continue;
    }

    if (staff.status === 'suspended' || staff.portal_restriction_reason) {
      results.push({ staffId, error: 'Staff is already restricted; replay endpoint will not alter an existing restriction.' });
      continue;
    }

    const restrictionMessage =
      'BIMED Staff Portal access was temporarily restricted as part of an administrative access-control review. Your staff record remained on file during this brief review, and portal access has now been restored.';

    try {
      const restricted = await restrictRecruitmentStaffPortal(client, staff.id, 'system:portal-email-replay', restrictionMessage);
      const restored = await reactivateRecruitmentStaffPortal(client, staff.id, 'system:portal-email-replay');
      results.push({
        staffId: staff.id,
        bimedEmail: staff.email,
        restricted,
        restored,
      });
    } catch (error) {
      results.push({
        staffId: staff.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store' } });
}
