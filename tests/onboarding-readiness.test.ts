import { describe, expect, it } from 'vitest';
import {
  onboardingChecklistForApplication,
  PRE_ACCESS_CHECK_KEYS,
  POST_ACCESS_CHECK_KEYS,
} from '@/lib/onboarding-readiness';

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

  it('keeps pre-access checks distinct from post-access checks', () => {
    expect(PRE_ACCESS_CHECK_KEYS).toEqual(new Set(['identity_verified', 'qualification_evidence_verified']));
    expect(POST_ACCESS_CHECK_KEYS).toEqual(
      new Set(['references_verified', 'right_to_work_verified', 'international_work_permission_verified']),
    );
  });
});
