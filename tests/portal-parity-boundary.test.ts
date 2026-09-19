import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

describe('BIMED portal parity boundary', () => {
  it('keeps the common lifecycle guardrails in the BIMED implementation', () => {
    const lifecycle = readFileSync('lib/staff.ts', 'utf8');
    const roles = readFileSync('lib/bimed-role-policy.ts', 'utf8');
    const readiness = readFileSync('lib/onboarding-readiness.ts', 'utf8');
    expect(lifecycle).toContain('The employment contract must be signed before the candidate can be promoted to staff.');
    expect(lifecycle).toContain('getOnboardingReadiness');
    expect(roles).toContain('CANONICAL_RECRUITMENT_ROLES');
    expect(readiness).toContain('PRE_ACCESS_CHECK_KEYS');
  });

  it('keeps BIMED free of extracted LAUREM implementation content', () => {
    expect(existsSync('lib/companies/laurem')).toBe(false);
    expect(existsSync('docs/laurem-build')).toBe(false);
  });

  it('retains BIMED-specific staff and overseas workflow surfaces', () => {
    const requiredFiles = [
      'app/api/staff/messages/route.ts',
      'app/api/staff/rota/route.ts',
      'app/api/staff/attendance/route.ts',
      'app/api/staff/payslips/route.ts',
      'app/api/staff/permit/route.ts',
      'app/api/staff/travel/route.ts',
      'app/api/admin/staff/route.ts',
      'app/api/admin/permit/page.tsx',
    ];
    for (const path of requiredFiles) expect(existsSync(path), path).toBe(true);
  });
});
