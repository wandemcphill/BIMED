import { describe, expect, it, vi } from 'vitest';
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
