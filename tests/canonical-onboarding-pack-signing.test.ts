import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('canonical onboarding-pack signing workflow', () => {
  it('uses one onboarding pack for contract, job description and handbook signing', async () => {
    const route = await fs.readFile('app/api/admin/applications/[id]/onboarding-pack/route.ts', 'utf8');
    const email = await fs.readFile('lib/full-onboarding-pack.ts', 'utf8');
    const helper = await fs.readFile('lib/contract-signature.ts', 'utf8');

    expect(route).toContain("resolvePackDocument('contract'");
    expect(route).toContain("resolvePackDocument('job_description'");
    expect(route).toContain("resolvePackDocument('handbook'");
    expect(route).toContain('if (latest?.status === \'signed\')');
    expect(route).toContain('contractResult = await resolvePackDocument');

    expect(email).toContain('Sign the employment contract, job description and employee handbook once');
    expect(email).toContain('do not require you to sign those three documents again');
    expect(email).toContain('Already signed:');

    expect(helper).toContain("status: 'revoked'");
    expect(helper).toContain('Replaced by a newer BIMED onboarding-pack signature request.');
  });

  it('disables standalone signing APIs', async () => {
    const contractRoute = await fs.readFile('app/api/admin/applications/[id]/contract-signature/route.ts', 'utf8');
    const documentRoute = await fs.readFile('app/api/admin/applications/[id]/document-signature/route.ts', 'utf8');

    expect(contractRoute).toContain('Standalone contract signing requests are disabled.');
    expect(documentRoute).toContain('Standalone document signing requests are disabled.');
  });

  it('makes staff onboarding acknowledgement-only for the three already-signed documents', async () => {
    const onboarding = await fs.readFile('lib/staff-onboarding.ts', 'utf8');

    expect(onboarding).toContain('Confirm signed employment contract');
    expect(onboarding).toContain('Acknowledge employee handbook');
    expect(onboarding).toContain('Acknowledge role and job description');
    expect(onboarding).toContain('No further signature is required.');
  });

  it('does not expose separate admin e-signature actions in the application UI', async () => {
    const page = await fs.readFile('components/AdminApplicationDetail.tsx', 'utf8');

    expect(page).toContain('Send complete onboarding pack');
    expect(page).toContain('Signing is managed through the complete onboarding pack.');
    expect(page).toContain('Do not issue a separate handbook signing request.');
    expect(page).toContain('Do not issue a separate job-description signing request.');
    expect(page).not.toContain('Send for e-signature');
    expect(page).not.toContain('Send handbook for e-signature');
    expect(page).not.toContain('Send job description for e-signature');
  });
});
