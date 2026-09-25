export const CONTRACT_ACCOMMODATION_OPTIONS = ['private_accommodation', 'accommodation_not_verified'] as const;

export type ContractAccommodationOption = (typeof CONTRACT_ACCOMMODATION_OPTIONS)[number];

export type ContractAddressResolution =
  | {
      ready: true;
      mode: 'local_residential';
      employeeAddress: string | null;
      message: string;
    }
  | {
      ready: true;
      mode: 'private_verified';
      employeeAddress: string;
      message: string;
    }
  | {
      ready: true;
      mode: 'not_verified';
      employeeAddress: null;
      message: string;
    }
  | {
      ready: false;
      mode: 'private_verification_required';
      employeeAddress: null;
      message: string;
    };

export type ContractAddressApplication = {
  living_in_ireland?: string | null;
  address?: string | null;
  country_of_residence?: string | null;
  current_country?: string | null;
  contract_accommodation_option?: string | null;
  verified_irish_residential_address?: string | null;
  contract_accommodation_verified_at?: string | null;
  contract_accommodation_verified_by?: string | null;
};

function normalizeCountry(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z]/g, '') || '';
}

function isExplicitlyNonIrishCountry(application: ContractAddressApplication) {
  const countries = [application.country_of_residence, application.current_country]
    .map(normalizeCountry)
    .filter(Boolean);

  return countries.length > 0 && countries.some((country) => country !== 'ireland' && country !== 'republicofireland');
}

export function resolveContractAddress(application: ContractAddressApplication): ContractAddressResolution {
  // Never allow a known non-Irish current/residential country to flow into the
  // Irish residential-address field, even if the legacy living_in_ireland flag is
  // stale or incorrectly set to "Yes".
  const isInternational =
    application.living_in_ireland === 'No' || isExplicitlyNonIrishCountry(application);

  if (!isInternational) {
    return {
      ready: true,
      mode: 'local_residential',
      employeeAddress: application.address?.trim() || null,
      message: application.address?.trim()
        ? 'The candidate is Ireland-based, so their recorded residential address may be used.'
        : 'No residential address is recorded for this Ireland-based candidate.',
    };
  }

  const option = application.contract_accommodation_option === 'private_accommodation'
    ? 'private_accommodation'
    : 'accommodation_not_verified';

  if (option === 'private_accommodation') {
    const address = application.verified_irish_residential_address?.trim() || '';
    const verifiedAt = application.contract_accommodation_verified_at?.trim() || '';
    const verifiedBy = application.contract_accommodation_verified_by?.trim() || '';

    if (!address || !verifiedAt || !verifiedBy) {
      return {
        ready: false,
        mode: 'private_verification_required',
        employeeAddress: null,
        message: 'Private Accommodation is selected, but BIMED has not recorded a verified Irish residential address. Verify the accommodation and address before issuing the final contract.',
      };
    }

    return {
      ready: true,
      mode: 'private_verified',
      employeeAddress: address,
      message: 'Private Accommodation verified by BIMED. The verified Irish residential address may be included in the final contract.',
    };
  }

  return {
    ready: true,
    mode: 'not_verified',
    employeeAddress: null,
    message: 'Accommodation has not been verified. No Irish residential address is included in the final contract.',
  };
}
