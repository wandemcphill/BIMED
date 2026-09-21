import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED permit lifecycle boundary', () => {
  it('routes admin permit status changes and detail edits through canonical RPCs', async () => {
    const route = await fs.readFile('app/api/admin/staff/[id]/permit/route.ts', 'utf8');

    expect(route).toContain("client.rpc('bimed_transition_staff_permit_status'");
    expect(route).toContain("client.rpc('bimed_update_staff_permit_details'");
    expect(route).not.toContain("from('recruitment_staff_permit_cases').update(update)");
    expect(route).not.toContain("permit_decision','permit_refusal_reason','visa_status");
    expect(route).toContain("message.includes('INVALID_PERMIT_STATUS') ? 400");
  });

  it('routes staff sponsorship requests through the canonical permit transition RPC', async () => {
    const route = await fs.readFile('app/api/staff/permit/route.ts', 'utf8');

    expect(route).toContain("client.rpc('bimed_transition_staff_permit_status'");
    expect(route).toContain("p_to_status: 'requested'");
    expect(route).not.toContain("update({ status: 'requested', requested_at:");
  });

  it('keeps the permit database transition boundary service-role only and reconciles eligibility', async () => {
    const migration = await fs.readFile('supabase/migrations/20260920102456_permit_lifecycle_hardening_20260920.sql', 'utf8');

    expect(migration).toContain('bimed_transition_staff_permit_status');
    expect(migration).toContain("v_work_authorised := case");
    expect(migration).toContain("shift_eligibility = case when v_work_authorised then 'eligible' else 'blocked' end");
    expect(migration).toContain('bimed_update_staff_permit_details');
    expect(migration).toContain('revoke all on function public.bimed_transition_staff_permit_status');
    expect(migration).toContain('grant execute on function public.bimed_transition_staff_permit_status(uuid,text,text,text)');
  });

  it('does not keep the duplicate hyphenated arrival-dispatch migration', async () => {
    await expect(
      fs.access('supabase/migrations/20260920100710_20260920_idempotent_arrival_transfer_dispatch.sql'),
    ).rejects.toThrow();

    await fs.access('supabase/migrations/20260920100710_20260920_idempotent_arrival_transfer_dispatch.sql');
  });
});
