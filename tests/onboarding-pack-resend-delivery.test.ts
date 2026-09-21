import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('onboarding pack resend delivery', () => {
  it('uses a fresh delivery key for explicit resends without changing the pack workflow', async () => {
    const route = await fs.readFile('app/api/admin/applications/[id]/onboarding-pack/route.ts', 'utf8');
    const helper = await fs.readFile('lib/full-onboarding-pack.ts', 'utf8');
    const page = await fs.readFile('components/AdminApplicationDetail.tsx', 'utf8');

    expect(route).toContain('const resend = (bodyResult.data as Record<string, unknown>).resend === true;');
    expect(route).toContain('deliveryKey: resend ?');
    expect(route).toContain('onboarding_pack_resend:');
    expect(helper).toContain('deliveryKey?: string');
    expect(helper).toContain('input.deliveryKey ||');
    expect(page).toContain('const resend = onboardingPackSent;');
    expect(page).toContain('resend })');
    expect(page).toContain('This pack email was already sent.');
    expect(page).toContain('email delivery failed:');
  });
});
