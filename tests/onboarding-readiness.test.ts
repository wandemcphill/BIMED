import { describe, expect, it } from 'vitest';
import { onboardingChecklistForApplication } from '@/lib/onboarding-readiness';

describe('onboarding readiness rules', () => {
  it('requires four baseline checks for local candidates', () => {
    const items = onboardingChecklistForApplication({ living_in_ireland: 'Yes' });
    expect(items.map((item) => item.item_key)).toEqual([
      'identity_verified',
      'qualification_evidence_verified',
      'references_verified',
      'right_to_work_verified',
    ]);
  });

  it('adds international work permission verification for overseas candidates', () => {
    const items = onboardingChecklistForApplication({ living_in_ireland: 'No' });
    expect(items.map((item) => item.item_key)).toContain('international_work_permission_verified');
    expect(items).toHaveLength(5);
  });
});
