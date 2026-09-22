import { describe, expect, it } from 'vitest';
import { normalizeResidentialProfile } from '@/lib/residential-profile';

describe('recruitment residential profile normalization', () => {
  it('replaces a stale trailing Ireland suffix for an international recruit', () => {
    expect(normalizeResidentialProfile({
      address: 'Block 150, Area B, Nyanya, FCT, Abuja, Ireland',
      residenceCountry: 'Nigeria',
      livingInIreland: 'No',
    })).toEqual({
      address_line_1: 'Block 150, Area B, Nyanya, FCT, Abuja, Nigeria',
      country: 'Nigeria',
    });
  });

  it('preserves an Irish residential address for a candidate recorded in Ireland', () => {
    expect(normalizeResidentialProfile({
      address: '12 Example Street, Dublin, Ireland',
      residenceCountry: 'Ireland',
      livingInIreland: 'Yes',
    })).toEqual({
      address_line_1: '12 Example Street, Dublin, Ireland',
      country: 'Ireland',
    });
  });

  it('uses current country for an overseas candidate when residence country is absent', () => {
    expect(normalizeResidentialProfile({
      address: 'Abuja, Ireland',
      currentCountry: 'Nigeria',
      livingInIreland: 'No',
    })).toEqual({
      address_line_1: 'Abuja, Nigeria',
      country: 'Nigeria',
    });
  });
});
