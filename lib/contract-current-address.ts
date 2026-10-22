export type CurrentResidentialAddressApplication = {
  address?: string | null;
  living_in_ireland?: string | null;
  country_of_residence?: string | null;
  current_country?: string | null;
};

export type CurrentResidentialAddressStaff = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  county?: string | null;
  eircode?: string | null;
  country?: string | null;
};

function cleanCountry(value?: string | null): string {
  const normalized = (value || '').trim();
  if (!normalized || /^(other|n\/a|unknown|to be confirmed)$/i.test(normalized)) return '';
  return normalized;
}

function normalizeCountry(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z]/g, '');
}

function countryAppearsAsAddressComponent(address: string, country: string): boolean {
  const wanted = normalizeCountry(country);
  return address
    .split(/[\n,;]+/)
    .map((part) => part.trim().replace(/^[.\s]+|[.\s]+$/g, ''))
    .some((part) => normalizeCountry(part) === wanted);
}

/**
 * Builds the applicant's current residential address, never the Irish work
 * location or the verified Irish accommodation address.
 *
 * Application residence fields are authoritative for the country. In
 * particular, the staff record's country may be an Ireland/workforce default
 * and must not overwrite an international applicant's actual residence.
 */
export function buildCurrentResidentialAddress(
  staff: CurrentResidentialAddressStaff,
  application?: CurrentResidentialAddressApplication | null,
): string {
  const address = (application?.address || '').trim() || [
    staff.address_line_1,
    staff.address_line_2,
    staff.city,
    staff.county,
    staff.eircode,
  ].map((part) => (part || '').trim()).filter(Boolean).join(', ');

  if (!address) return '';

  let country = '';
  if (application?.living_in_ireland === 'Yes') {
    country = 'Ireland';
  } else {
    country = cleanCountry(application?.current_country)
      || cleanCountry(application?.country_of_residence);

    // Only use the legacy staff country where the application does not mark
    // the person as international. Never append Ireland to an explicitly
    // overseas applicant merely because the staff record says Ireland.
    if (!country && application?.living_in_ireland !== 'No') {
      country = cleanCountry(staff.country);
    }
  }

  if (!country || countryAppearsAsAddressComponent(address, country)) return address;
  return address + ', ' + country;
}
