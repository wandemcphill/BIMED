import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createStaffFromApplication } from '@/lib/staff';

function clientMock(signatureRow: unknown) {
  const signedContractQuery = {
    select: vi.fn(() => signedContractQuery),
    eq: vi.fn(() => signedContractQuery),
    order: vi.fn(() => signedContractQuery),
    limit: vi.fn(() => signedContractQuery),
    maybeSingle: vi.fn(async () => ({ data: signatureRow, error: null })),
  };

  const application = {
    id: 'app-1',
    full_name: 'Test Candidate',
    preferred_name: 'Test',
    email: 'test@example.com',
    phone: '+353000000000',
    date_of_birth: '1990-01-01',
    nationality: 'Nigerian',
    role_applied: 'Support Worker',
    employment_type: 'Full-time',
    start_date: null,
    address: '1 Test Street',
    living_in_ireland: 'Yes',
    bimed_id: null,
  };

  const applicationsQuery = {
    select: vi.fn(() => applicationsQuery),
    eq: vi.fn(() => applicationsQuery),
    single: vi.fn(async () => ({ data: application, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'recruitment_applications') return applicationsQuery;
      if (table === 'recruitment_contract_signatures') return signedContractQuery;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as any;

  return client;
}

describe('staff promotion contract gate', () => {
  it('rejects promotion when no signed contract exists', async () => {
    await expect(createStaffFromApplication(clientMock(null), 'app-1')).rejects.toThrow(
      'The employment contract must be signed before the candidate can be promoted to staff.',
    );
  });

  it('rejects a signed contract whose role does not match the application', async () => {
    await expect(
      createStaffFromApplication(clientMock({
        id: 'sig-1',
        role_slug: 'senior-support-worker',
        employee_name: 'Test Candidate',
        employee_address: '1 Test Street',
        start_date: '2027-01-11',
        status: 'signed',
        signed_at: '2026-09-09T12:00:00.000Z',
      }), 'app-1'),
    ).rejects.toThrow('The signed contract role does not match the candidate\'s applied role.');
  });
});


describe('staff promotion escape-hatch regression', () => {
  it('does not expose an uncontracted hire override', async () => {
    const source = await fs.readFile('lib/staff.ts', 'utf8');
    expect(source).not.toContain('allowUncontractedHire');
  });
});


describe('staff provisioning boundary', () => {
  it('keeps staff provisioning at onboarding or Hired rather than early recruitment statuses', async () => {
    const route = await import('node:fs/promises').then((fs) => fs.readFile('app/api/admin/applications/[id]/route.ts', 'utf8'));
    expect(route).toContain("['Onboarding', 'Hired'].includes(body.status)");
    expect(route).not.toContain("['Selected', 'Offer Issued', 'Onboarding', 'Hired'].includes(body.status)");
  });

  it('routes lifecycle-linked staff creation through the atomic promotion RPC', async () => {
    const [route, migration, externalMigration] = await Promise.all([
      import('node:fs/promises').then((fs) => fs.readFile('app/api/admin/applications/[id]/route.ts', 'utf8')),
      import('node:fs/promises').then((fs) => fs.readFile(
        'supabase/migrations/20260921130430_20260919zz_bimed_atomic_staff_promotion_reconcile.sql',
        'utf8',
      )),
      import('node:fs/promises').then((fs) => fs.readFile(
        'supabase/migrations/20260921162947_bimed_external_contract_verification_20260921.sql',
        'utf8',
      )),
    ]);
    expect(route).toContain('lifecycle: {');
    expect(route).toContain("toStatus: body.status as 'Onboarding' | 'Hired'");
    expect(route).toContain('provisioningWarning');
    expect(migration).toContain('bimed_promote_application_to_staff');
    expect(migration).toContain('perform public.bimed_transition_application_status(');
    expect(migration).toContain('insert into public.recruitment_staff(');
    expect(externalMigration).toContain('recruitment_external_contract_verifications');
    expect(externalMigration).toContain('bimed_record_external_contract_verification');
    expect(externalMigration).toContain('A signed BIMED contract or an administrator-verified externally signed contract is required before staff provisioning.');
  });
});


describe('contract-first provisioning regression', () => {
  it('does not retain the obsolete pre-access verification block in staff promotion', async () => {
    const fs = await import('node:fs/promises');
    const migration = await fs.readFile(
      'supabase/migrations/20260921162326_bimed_staff_promotion_contract_boundary_20260921.sql',
      'utf8',
    );
    expect(migration).not.toContain('PRE_ACCESS_VERIFICATION_BLOCKED');
    expect(migration).toContain('SIGNED_CONTRACT_REQUIRED');
  });

  it('gates contract issuance and the full onboarding pack on pre-contract verification', async () => {
    const fs = await import('node:fs/promises');
    const contractRoute = await fs.readFile('app/api/admin/applications/[id]/contract-signature/route.ts', 'utf8');
    const packRoute = await fs.readFile('app/api/admin/applications/[id]/onboarding-pack/route.ts', 'utf8');
    expect(contractRoute).toContain('getPreContractReadiness');
    expect(packRoute).toContain('getPreContractReadiness');
    expect(contractRoute).toContain('Contract issuance is blocked until identity, qualification and references are verified or formally waived.');
    expect(packRoute).toContain('Contract issuance is blocked until identity, qualification and references are verified or formally waived.');
  });
});
