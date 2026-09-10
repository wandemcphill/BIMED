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

  it('exposes the onboarding workspace without granting staff mutation rights', async () => {
    const page = await repoFile('app/staff/onboarding/page.tsx');
    expect(page).toContain("/api/staff/onboarding");
    expect(page).toContain('This page is read-only.');
    expect(page).toContain('Onboarding readiness requirements are complete.');
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

  it('keeps the existing onboarding gate before staff creation', async () => {
    const staff = await repoFile('lib/staff.ts');
    expect(staff).toContain('getOnboardingReadiness');
    expect(staff).toContain("if (!readiness.ready)");
  });
});
