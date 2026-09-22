export function normalizeResidentialProfile(input: {
  address?: string | null;
  residenceCountry?: string | null;
  currentCountry?: string | null;
  livingInIreland?: string | null;
}) {
  const country =
    input.residenceCountry?.trim() ||
    (input.livingInIreland === 'No' ? input.currentCountry?.trim() : '') ||
    'Ireland';

  let address = input.address?.trim() || null;

  // International recruits sometimes have a stale country suffix copied into
  // the free-form address field. Correct only a trailing ", Ireland" when the
  // candidate's recorded country of residence is explicitly another country.
  if (address && country.toLowerCase() !== 'ireland') {
    address = address.replace(/,\s*ireland\s*$/i, ', ' + country);
  }

  return {
    address_line_1: address,
    country,
  };
}
