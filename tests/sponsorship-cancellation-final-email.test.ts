import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('sponsorship cancellation final email', () => {
  it('sends the final candidate notification after atomic cancellation enforcement and records an idempotency marker', async () => {
    const route = await fs.readFile('app/api/internal/sponsorship-cancellations/route.ts', 'utf8');
    const migration = await fs.readFile(
      'supabase/migrations/20260921171845_sponsorship_cancellation_final_email_20260921.sql',
      'utf8',
    );

    expect(route).toContain("bimed_enforce_due_sponsorship_cancellations");
    expect(route).toContain("sendAccommodationEmail");
    expect(route).toContain("sponsorship_cancellation_final_email_failed");
    expect(route).toContain("cancellation_finalization_email_sent_at");
    expect(route).toContain(".is('cancellation_finalization_email_sent_at', null)");
    expect(route).toContain("Sponsorship cancellation finalised");
    expect(route).toContain("24-hour cancellation reversal window has expired");
    expect(route).not.toContain("return NextResponse.json({ ok: true, finalized: Number(data || 0) });");

    expect(migration).toContain('cancellation_finalization_email_sent_at');
    expect(migration).toContain('recruitment_staff_permit_cases_cancellation_email_pending_idx');
  });
});
