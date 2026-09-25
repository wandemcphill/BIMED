import { describe, expect, it } from 'vitest';
import { resolveContractAddress } from '@/lib/contract-accommodation';

describe('contract accommodation address policy', () => {
  it('uses an Ireland-based candidate residential address without invoking overseas accommodation verification', () => {
    expect(resolveContractAddress({
      living_in_ireland: 'Yes',
      country_of_residence: 'Ireland',
      current_country: 'Ireland',
      address: '12 Example Street, Dublin, Ireland',
    })).toMatchObject({
      ready: true,
      mode: 'local_residential',
      employeeAddress: '12 Example Street, Dublin, Ireland',
    });
  });

  it('blocks private accommodation until BIMED records a verified address and verification metadata', () => {
    const result = resolveContractAddress({
      living_in_ireland: 'No',
      country_of_residence: 'Zimbabwe',
      contract_accommodation_option: 'private_accommodation',
      verified_irish_residential_address: '12 Example Street, Dublin, Ireland',
    });

    expect(result.ready).toBe(false);
    expect(result.mode).toBe('private_verification_required');
    expect(result.employeeAddress).toBeNull();
  });

  it('includes only the verified Irish address for private accommodation', () => {
    expect(resolveContractAddress({
      living_in_ireland: 'No',
      country_of_residence: 'Zimbabwe',
      current_country: 'Zimbabwe',
      contract_accommodation_option: 'private_accommodation',
      verified_irish_residential_address: '12 Example Street, Dublin, Ireland',
      contract_accommodation_verified_at: '2026-09-24T12:00:00.000Z',
      contract_accommodation_verified_by: 'hr@example.com',
    })).toMatchObject({
      ready: true,
      mode: 'private_verified',
      employeeAddress: '12 Example Street, Dublin, Ireland',
    });
  });

  it('does not carry an overseas application address into the contract when accommodation is not verified', () => {
    expect(resolveContractAddress({
      living_in_ireland: 'No',
      address: '14 Main Road, Harare, Zimbabwe',
      country_of_residence: 'Zimbabwe',
      current_country: 'Zimbabwe',
      contract_accommodation_option: 'accommodation_not_verified',
    })).toMatchObject({
      ready: true,
      mode: 'not_verified',
      employeeAddress: null,
    });
  });

  it('rejects a foreign address even when the legacy Ireland flag is incorrectly set to Yes', () => {
    expect(resolveContractAddress({
      living_in_ireland: 'Yes',
      address: '73 Learoyd, Braeside, Harare, Zimbabwe',
      country_of_residence: 'Zimbabwe',
      current_country: 'Zimbabwe',
      contract_accommodation_option: 'accommodation_not_verified',
    })).toMatchObject({
      ready: true,
      mode: 'not_verified',
      employeeAddress: null,
    });
  });
});
