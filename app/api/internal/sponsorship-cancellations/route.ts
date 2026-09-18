import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const expected = process.env.BIMED_SPONSORSHIP_CRON_SECRET?.trim() || '';
  const received = request.headers.get('x-bimed-cron-secret')?.trim() || '';
  if (!expected || !received || received !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const client = db();
    const { data, error } = await client.rpc('bimed_enforce_due_sponsorship_cancellations');
    if (error) throw error;
    return NextResponse.json({ ok: true, finalized: Number(data || 0) });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'sponsorship_cancellation_enforcement_failed',
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to enforce due sponsorship cancellations.' }, { status: 500 });
  }
}
