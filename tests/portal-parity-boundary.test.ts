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
    const home = readFileSync('app/staff/page.tsx', 'utf8');
    const staff360 = readFileSync('app/admin/staff/[id]/page.tsx', 'utf8');
    const staff360Api = readFileSync('app/api/admin/staff/[id]/route.ts', 'utf8');
    expect(home).toContain("'leave', 'Leave'");
    expect(home).toContain("action: 'request_leave'");
    expect(home).toContain('My leave history');
    expect(staff360).toContain('Time & attendance');
    expect(staff360Api).toContain("from('recruitment_staff_attendance')");

    expect(readFileSync('app/api/staff/auth/password-reset/route.ts', 'utf8')).toContain('staff-password-reset');
    expect(readFileSync('app/staff/password-reset/page.tsx', 'utf8')).toContain('Send password reset link');
    expect(readFileSync('app/staff/documents/page.tsx', 'utf8')).toContain('My Documents');
    expect(readFileSync('app/staff/page.tsx', 'utf8')).toContain("'/staff/documents'");

    const requiredFiles = [
      'app/api/staff/messages/route.ts',
      'app/api/staff/rota/route.ts',
      'app/api/staff/attendance/route.ts',
      'app/api/staff/payslips/route.ts',
      'app/api/staff/permit/route.ts',
      'app/api/staff/travel/route.ts',
      'app/api/admin/staff/route.ts',
      'app/admin/permit/page.tsx',
    ];
    for (const path of requiredFiles) expect(existsSync(path), path).toBe(true);
  });
});
