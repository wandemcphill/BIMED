import { describe, expect, it } from 'vitest';
import { buildCurrentResidentialAddress } from '@/lib/contract-current-address';

describe('current residential country in contract addresses', () => {
  it('uses the application country instead of a misleading Ireland value on the staff row', () => {
    const address = buildCurrentResidentialAddress(
      {
        address_line_1: '8-3, opposite Sridevi Medical Shop, Visakhapatnam- 530040',
        country: 'Ireland',
      },
      {
        address: '8-3, opposite Sridevi Medical Shop, thotaguruvu junction, Visakhapatnam- 530040',
        living_in_ireland: 'No',
        country_of_residence: 'India',
        current_country: 'India',
      },
    );

    expect(address).toBe('8-3, opposite Sridevi Medical Shop, thotaguruvu junction, Visakhapatnam- 530040, India');
    expect(address).not.toMatch(/Ireland$/i);
  });

  it('does not duplicate the country if it is already present in the application address', () => {
    expect(buildCurrentResidentialAddress(
      { address_line_1: 'unused', country: 'Ireland' },
      {
        address: 'Kasaragod, Kerala, India\nPin: 671532',
        living_in_ireland: 'No',
        country_of_residence: 'India',
        current_country: 'India',
      },
    )).toBe('Kasaragod, Kerala, India\nPin: 671532');
  });

  it('uses Ireland for a candidate who says they currently live in Ireland', () => {
    expect(buildCurrentResidentialAddress(
      { address_line_1: '12 Example Road', country: 'India' },
      { address: '12 Example Road, Cork', living_in_ireland: 'Yes', current_country: 'India' },
    )).toBe('12 Example Road, Cork, Ireland');
  });

  it('does not substitute staff country Ireland for an explicitly overseas candidate with no country value', () => {
    expect(buildCurrentResidentialAddress(
      { address_line_1: 'Example address', country: 'Ireland' },
      { address: 'Example address', living_in_ireland: 'No', country_of_residence: 'Other', current_country: null },
    )).toBe('Example address');
  });

  it('prefers a non-Irish residence country when the application country fields conflict', () => {
    expect(buildCurrentResidentialAddress(
      { address_line_1: 'Example address', country: 'Ireland' },
      { address: 'Example address', living_in_ireland: 'No', country_of_residence: 'India', current_country: 'Ireland' },
    )).toBe('Example address, India');
  });

  it('builds an address from staff address lines but gets country from the application', () => {
    expect(buildCurrentResidentialAddress(
      { address_line_1: 'Example Road', city: 'Visakhapatnam', country: 'Ireland' },
      { living_in_ireland: 'No', country_of_residence: 'India', current_country: 'India' },
    )).toBe('Example Road, Visakhapatnam, India');
  });
});
