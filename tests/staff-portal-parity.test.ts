import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

const repoFile = async (path: string) => fs.readFile(path, 'utf8');

describe('BIMED staff portal parity', () => {
  it('keeps the runtime and CI on Node 22', async () => {
    const pkg = JSON.parse(await repoFile('package.json')) as { engines?: { node?: string } };
    const ci = await repoFile('.github/workflows/ci.yml');
    expect(pkg.engines?.node).toContain('22.');
    expect(ci).toContain('node-version: 22.x');
  });

  it('provides a self-only onboarding endpoint', async () => {
    const route = await repoFile('app/api/staff/onboarding/route.ts');
    expect(route).toContain("getStaffSession(request)");
    expect(route).toContain(".eq('id', session.staff_id)");
    expect(route).toContain(".from('recruitment_onboarding_checklist')");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".upsert(");
  });

  it('exposes the three post-access checks without staff-side mutation controls', async () => {
    const page = await repoFile('app/staff/onboarding/page.tsx');
    expect(page).toContain("/api/staff/onboarding");
    expect(page).toContain('Post-access verification');
    expect(page).toContain('Portal access approved');
    expect(page).toContain('references_verified');
    expect(page).toContain('right_to_work_verified');
    expect(page).toContain('international_work_permission_verified');
    expect(page).not.toContain('This page is read-only.');
    expect(page).not.toContain('Onboarding readiness requirements are complete.');
  });

  it('retains BIMED workforce coverage across rota, attendance, payslips and profile services', async () => {
    const rota = await repoFile('app/api/staff/rota/route.ts');
    const attendance = await repoFile('app/api/staff/attendance/route.ts');
    const payslips = await repoFile('app/api/staff/payslips/route.ts');
    const profile = await repoFile('app/api/staff/me/route.ts');
    expect(rota).toContain('getStaffSession');
    expect(attendance).toContain('getStaffSession');
    expect(attendance).toContain(".eq('staff_id', session.staff_id)");
    expect(payslips).toContain(".eq('staff_id', session.staff_id)");
    expect(profile).toContain(".eq('id', session.staff_id)");
  });

  it('uses the signed-contract boundary before staff creation and resets only post-access checks', async () => {
    const staff = await repoFile('lib/staff.ts');
    expect(staff).toContain('recruitment_external_contract_verifications');
    expect(staff).toContain('A signed BIMED contract or an administrator-verified externally signed contract is required');
    expect(staff).toContain(".in('item_key', Array.from(POST_ACCESS_CHECK_KEYS))");
    expect(staff).toContain("status: 'pending'");
    expect(staff).not.toContain('getOnboardingReadiness');
    expect(staff).not.toContain('PRE_ACCESS_CHECK_KEYS');
  });
});
