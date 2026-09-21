import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import {
  BIMED_STATUS_TRANSITIONS,
  localBimedTransitionAllowed,
  isBimedRecruitmentStatus,
  getBimedStatusOptions,
} from '@/lib/bimed-lifecycle';

describe('BIMED recruitment lifecycle policy', () => {
  it('defines the canonical recruitment statuses', () => {
    expect(isBimedRecruitmentStatus('Interview')).toBe(true);
    expect(isBimedRecruitmentStatus('Not a real status')).toBe(false);
  });

  it('allows the intended progression and blocks backward jumps', () => {
    expect(localBimedTransitionAllowed('Submitted', 'Under Review')).toBe(true);
    expect(localBimedTransitionAllowed('Submitted', 'Interview')).toBe(true);
    expect(localBimedTransitionAllowed('Interview', 'Selected')).toBe(true);
    expect(localBimedTransitionAllowed('Onboarding', 'Hired')).toBe(true);
    expect(localBimedTransitionAllowed('Hired', 'Interview')).toBe(false);
    expect(localBimedTransitionAllowed('Rejected', 'Onboarding')).toBe(false);
    expect(BIMED_STATUS_TRANSITIONS['Permit Processing']).toContain('Visa/Immigration Processing');
  });

  it('exposes only lifecycle-reachable admin status options', () => {
    expect(getBimedStatusOptions('Offer Issued')).toEqual([
      'Offer Issued',
      'Documents Awaiting',
      'Onboarding',
      'Rejected',
      'Withdrawn',
    ]);
    expect(getBimedStatusOptions('Offer Issued')).not.toContain('Hired');
    expect(getBimedStatusOptions('Onboarding')).toContain('Hired');
    expect(getBimedStatusOptions('Hired')).toEqual(['Hired']);
  });

  it('removes duplicate lifecycle logic from the legacy recruitment endpoint', async () => {
    const route = await fs.readFile('app/api/recruitment/applications/[id]/route.ts', 'utf8');
    expect(route).toContain("export { GET, PATCH, DELETE } from '@/app/api/admin/applications/[id]/route';");
    expect(route).not.toContain("from '@/lib/staff'");
    expect(route).not.toContain(".update({ status");
  });

  it('uses a single atomic status transition RPC in the canonical admin route', async () => {
    const route = await fs.readFile('app/api/admin/applications/[id]/route.ts', 'utf8');
    const migration = await fs.readFile('supabase/migrations/20260919220144_20260919_bimed_application_lifecycle_integrity.sql', 'utf8');
    expect(route).toContain('transitionBimedApplicationStatus');
    expect(route).toContain('localBimedTransitionAllowed');
    expect(migration).toContain('bimed_transition_application_status');
    expect(migration).toContain('for update');
    expect(migration).toContain('STATUS_TRANSITION_BLOCKED');
  });
});


describe('contract issuance lifecycle boundary', () => {
  it('lets the contract issuance RPC own Submitted to Offer Issued when pre-contract checks are complete', async () => {
    const fs = await import('node:fs/promises');
    const migration = await fs.readFile(
      'supabase/migrations/20260921192748_contract_issue_offer_transition_20260921.sql',
      'utf8',
    );
    const packRoute = await fs.readFile(
      'app/api/admin/applications/[id]/onboarding-pack/route.ts',
      'utf8',
    );

    expect(migration).toContain("if v_application.status = 'Submitted' then");
    expect(migration).toContain("set status = 'Offer Issued'");
    expect(migration).toContain('PRE_CONTRACT_VERIFICATION_BLOCKED');
    expect(packRoute).toContain("previousStatus === 'Submitted'");
    expect(packRoute).not.toContain('transitionBimedApplicationStatus');
  });
});
