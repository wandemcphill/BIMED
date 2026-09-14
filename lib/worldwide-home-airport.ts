type Airport = { code: string; name: string; city: string; country_code: string; country_name: string };

const DIRECTORY_URL = 'https://raw.githubusercontent.com/datasets/airport-codes/main/data/airport-codes.csv';

const FIXED: Record<string, Airport> = {
  NG: { code: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', country_code: 'NG', country_name: 'Nigeria' },
  GH: { code: 'ACC', name: 'Kotoka International Airport', city: 'Accra', country_code: 'GH', country_name: 'Ghana' },
  KE: { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country_code: 'KE', country_name: 'Kenya' },
  ZA: { code: 'JNB', name: 'O. R. Tambo International Airport', city: 'Johannesburg', country_code: 'ZA', country_name: 'South Africa' },
  IN: { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country_code: 'IN', country_name: 'India' },
  AE: { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country_code: 'AE', country_name: 'United Arab Emirates' },
  GB: { code: 'LHR', name: 'Heathrow Airport', city: 'London', country_code: 'GB', country_name: 'United Kingdom' },
  US: { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country_code: 'US', country_name: 'United States' },
  CA: { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country_code: 'CA', country_name: 'Canada' },
  AU: { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country_code: 'AU', country_name: 'Australia' },
  JP: { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country_code: 'JP', country_name: 'Japan' },
  CN: { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country_code: 'CN', country_name: 'China' },
  SG: { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country_code: 'SG', country_name: 'Singapore' },
  BR: { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country_code: 'BR', country_name: 'Brazil' },
  FR: { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country_code: 'FR', country_name: 'France' },
  DE: { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country_code: 'DE', country_name: 'Germany' },
  IT: { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country_code: 'IT', country_name: 'Italy' },
  ES: { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country_code: 'ES', country_name: 'Spain' },
  PT: { code: 'LIS', name: 'Humberto Delgado Airport', city: 'Lisbon', country_code: 'PT', country_name: 'Portugal' },
  NL: { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country_code: 'NL', country_name: 'Netherlands' },
  BE: { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country_code: 'BE', country_name: 'Belgium' },
  CH: { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country_code: 'CH', country_name: 'Switzerland' },
  IE: { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country_code: 'IE', country_name: 'Ireland' },
  KR: { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country_code: 'KR', country_name: 'South Korea' },
  MX: { code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country_code: 'MX', country_name: 'Mexico' },
  TR: { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country_code: 'TR', country_name: 'Türkiye' },
  EG: { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country_code: 'EG', country_name: 'Egypt' },
  MA: { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', country_code: 'MA', country_name: 'Morocco' }
};

const ALIASES: Record<string, string> = {
  nigeria: 'NG', india: 'IN', kenya: 'KE', ireland: 'IE', uk: 'GB', 'united kingdom': 'GB', 'united states': 'US', usa: 'US', canada: 'CA', australia: 'AU', 'new zealand': 'NZ', 'south africa': 'ZA', ghana: 'GH', gambia: 'GM', rwanda: 'RW', zimbabwe: 'ZW', japan: 'JP', brazil: 'BR', 'united arab emirates': 'AE', uae: 'AE', 'sri lanka': 'LK', cameroon: 'CM', ethiopia: 'ET', tanzania: 'TZ', uganda: 'UG', senegal: 'SN', egypt: 'EG', morocco: 'MA', angola: 'AO', mozambique: 'MZ', mauritius: 'MU', france: 'FR', germany: 'DE', italy: 'IT', spain: 'ES', portugal: 'PT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH', poland: 'PL', romania: 'RO', russia: 'RU', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', 'south korea': 'KR', malaysia: 'MY', thailand: 'TH', indonesia: 'ID', philippines: 'PH', vietnam: 'VN', pakistan: 'PK', nepal: 'NP', myanmar: 'MM', israel: 'IL', 'saudi arabia': 'SA', qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM', 'democratic republic of the congo': 'CD', 'republic of the congo': 'CG'
};

function csv(line: string) {
  const cells: string[] = []; let current = ''; let quote = false;
  for (let i = 0; i < line.length; i += 1) { const ch = line[i]; if (ch === '"') { if (quote && line[i + 1] === '"') { current += '"'; i += 1; } else quote = !quote; continue; } if (ch === ',' && !quote) { cells.push(current); current = ''; continue; } current += ch; }
  cells.push(current); return cells;
}

let cache: { at: number; airports: Airport[] } | null = null;
async function directory() {
  if (cache && Date.now() - cache.at < 24 * 60 * 60 * 1000) return cache.airports;
  const response = await fetch(DIRECTORY_URL, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Unable to load the global airport directory.');
  const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
  const headers = csv(lines.shift() || '').map((value) => value.trim()); const index = new Map(headers.map((name, i) => [name, i])); const rows: Airport[] = [];
  for (const line of lines) { const row = csv(line); const code = row[index.get('iata_code') ?? -1] || ''; const country = row[index.get('iso_country') ?? -1] || ''; const type = row[index.get('type') ?? -1] || ''; const scheduled = row[index.get('scheduled_service') ?? -1] || ''; if (!code || !country || scheduled === 'no' || !['large_airport','medium_airport'].includes(type)) continue; rows.push({ code, name: row[index.get('name') ?? -1] || code, city: row[index.get('municipality') ?? -1] || code, country_code: country, country_name: country }); }
  cache = { at: Date.now(), airports: rows }; return rows;
}

export async function resolveWorldwideHomeAirport(countryValue: string): Promise<Airport> {
  const normalized = countryValue.trim(); const code = /^[A-Za-z]{2}$/.test(normalized) ? normalized.toUpperCase() : ALIASES[normalized.toLowerCase()];
  if (!code) throw new Error('BIMED could not identify the candidate home country.');
  if (FIXED[code]) return FIXED[code];
  const airports = (await directory()).filter((airport) => airport.country_code === code).sort((a, b) => a.name.localeCompare(b.name));
  if (!airports.length) throw new Error(`BIMED has no supported commercial departure airport for ${countryValue} yet.`);
  const preferred = airports.find((airport) => /international|airport/i.test(airport.name)) || airports[0];
  return { ...preferred, country_name: countryValue };
}
