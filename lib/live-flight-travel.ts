import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateDirectConversation } from '@/lib/staff-messaging';

const DUFFEL_API_URL = 'https://api.duffel.com';
const NOTICE_HOURS = 72;
export const DUBLIN = { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland' } as const;

type Airport = { code: string; name: string; city: string; country_code: string; country_name: string };
export type FlightPassengerInput = { full_name: string; date_of_birth: string };

const HOME_AIRPORTS: Record<string, Airport> = {
  NG: { code: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', country_code: 'NG', country_name: 'Nigeria' },
  GH: { code: 'ACC', name: 'Kotoka International Airport', city: 'Accra', country_code: 'GH', country_name: 'Ghana' },
  KE: { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country_code: 'KE', country_name: 'Kenya' },
  ZA: { code: 'JNB', name: 'O. R. Tambo International Airport', city: 'Johannesburg', country_code: 'ZA', country_name: 'South Africa' },
  IN: { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country_code: 'IN', country_name: 'India' },
  PK: { code: 'LHE', name: 'Allama Iqbal International Airport', city: 'Lahore', country_code: 'PK', country_name: 'Pakistan' },
  LK: { code: 'CMB', name: 'Bandaranaike International Airport', city: 'Colombo', country_code: 'LK', country_name: 'Sri Lanka' },
  RW: { code: 'KGL', name: 'Kigali International Airport', city: 'Kigali', country_code: 'RW', country_name: 'Rwanda' },
  ZW: { code: 'HRE', name: 'Robert Gabriel Mugabe International Airport', city: 'Harare', country_code: 'ZW', country_name: 'Zimbabwe' },
  GM: { code: 'BJL', name: 'Banjul International Airport', city: 'Banjul', country_code: 'GM', country_name: 'Gambia' },
  AE: { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country_code: 'AE', country_name: 'United Arab Emirates' },
  GB: { code: 'LHR', name: 'Heathrow Airport', city: 'London', country_code: 'GB', country_name: 'United Kingdom' },
  US: { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country_code: 'US', country_name: 'United States' },
  CA: { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country_code: 'CA', country_name: 'Canada' },
  BR: { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country_code: 'BR', country_name: 'Brazil' },
  JP: { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country_code: 'JP', country_name: 'Japan' },
  CN: { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country_code: 'CN', country_name: 'China' },
  SG: { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country_code: 'SG', country_name: 'Singapore' },
  AU: { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country_code: 'AU', country_name: 'Australia' },
  NZ: { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country_code: 'NZ', country_name: 'New Zealand' },
  TR: { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country_code: 'TR', country_name: 'Türkiye' },
  EG: { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country_code: 'EG', country_name: 'Egypt' },
  MA: { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', country_code: 'MA', country_name: 'Morocco' },
  ET: { code: 'ADD', name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', country_code: 'ET', country_name: 'Ethiopia' },
  TZ: { code: 'JRO', name: 'Kilimanjaro International Airport', city: 'Arusha', country_code: 'TZ', country_name: 'Tanzania' },
  UG: { code: 'EBB', name: 'Entebbe International Airport', city: 'Entebbe', country_code: 'UG', country_name: 'Uganda' },
  SN: { code: 'DSS', name: 'Blaise Diagne International Airport', city: 'Dakar', country_code: 'SN', country_name: 'Senegal' },
  CI: { code: 'ABJ', name: 'Félix-Houphouët-Boigny International Airport', city: 'Abidjan', country_code: 'CI', country_name: 'Côte d’Ivoire' },
  CM: { code: 'DLA', name: 'Douala International Airport', city: 'Douala', country_code: 'CM', country_name: 'Cameroon' },
  CD: { code: 'FIH', name: 'N’djili International Airport', city: 'Kinshasa', country_code: 'CD', country_name: 'Democratic Republic of the Congo' },
  CG: { code: 'BZV', name: 'Maya-Maya Airport', city: 'Brazzaville', country_code: 'CG', country_name: 'Republic of the Congo' },
  AO: { code: 'LAD', name: 'Quatro de Fevereiro Airport', city: 'Luanda', country_code: 'AO', country_name: 'Angola' },
  MZ: { code: 'MPM', name: 'Maputo International Airport', city: 'Maputo', country_code: 'MZ', country_name: 'Mozambique' },
  MU: { code: 'MRU', name: 'Sir Seewoosagur Ramgoolam International Airport', city: 'Mahébourg', country_code: 'MU', country_name: 'Mauritius' },
  FR: { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country_code: 'FR', country_name: 'France' },
  DE: { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country_code: 'DE', country_name: 'Germany' },
  IT: { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country_code: 'IT', country_name: 'Italy' },
  ES: { code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country_code: 'ES', country_name: 'Spain' },
  PT: { code: 'LIS', name: 'Humberto Delgado Airport', city: 'Lisbon', country_code: 'PT', country_name: 'Portugal' },
  NL: { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country_code: 'NL', country_name: 'Netherlands' },
  BE: { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country_code: 'BE', country_name: 'Belgium' },
  CH: { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country_code: 'CH', country_name: 'Switzerland' },
  IE: { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country_code: 'IE', country_name: 'Ireland' },
  PL: { code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country_code: 'PL', country_name: 'Poland' },
  RO: { code: 'OTP', name: 'Henri Coandă International Airport', city: 'Bucharest', country_code: 'RO', country_name: 'Romania' },
  RU: { code: 'SVO', name: 'Sheremetyevo International Airport', city: 'Moscow', country_code: 'RU', country_name: 'Russia' },
  MX: { code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country_code: 'MX', country_name: 'Mexico' },
  AR: { code: 'EZE', name: 'Ezeiza International Airport', city: 'Buenos Aires', country_code: 'AR', country_name: 'Argentina' },
  CL: { code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country_code: 'CL', country_name: 'Chile' },
  CO: { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', country_code: 'CO', country_name: 'Colombia' },
  PE: { code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', country_code: 'PE', country_name: 'Peru' },
  KR: { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country_code: 'KR', country_name: 'South Korea' },
  MY: { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country_code: 'MY', country_name: 'Malaysia' },
  TH: { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country_code: 'TH', country_name: 'Thailand' },
  ID: { code: 'CGK', name: 'Soekarno–Hatta International Airport', city: 'Jakarta', country_code: 'ID', country_name: 'Indonesia' },
  PH: { code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country_code: 'PH', country_name: 'Philippines' },
  VN: { code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country_code: 'VN', country_name: 'Vietnam' },
  NP: { code: 'KTM', name: 'Tribhuvan International Airport', city: 'Kathmandu', country_code: 'NP', country_name: 'Nepal' },
  IL: { code: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', country_code: 'IL', country_name: 'Israel' },
  SA: { code: 'JED', name: 'King Abdulaziz International Airport', city: 'Jeddah', country_code: 'SA', country_name: 'Saudi Arabia' },
  QA: { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country_code: 'QA', country_name: 'Qatar' },
  KW: { code: 'KWI', name: 'Kuwait International Airport', city: 'Kuwait City', country_code: 'KW', country_name: 'Kuwait' },
  BH: { code: 'BAH', name: 'Bahrain International Airport', city: 'Manama', country_code: 'BH', country_name: 'Bahrain' },
  OM: { code: 'MCT', name: 'Muscat International Airport', city: 'Muscat', country_code: 'OM', country_name: 'Oman' },
};

const aliases: Record<string, string> = { nigeria: 'NG', india: 'IN', kenya: 'KE', ireland: 'IE', 'united kingdom': 'GB', uk: 'GB', 'united states': 'US', usa: 'US', canada: 'CA', australia: 'AU', 'new zealand': 'NZ', 'south africa': 'ZA', ghana: 'GH', gambia: 'GM', rwanda: 'RW', zimbabwe: 'ZW', japan: 'JP', brazil: 'BR', 'united arab emirates': 'AE', uae: 'AE', 'sri lanka': 'LK', 'côte d’ivoire': 'CI', 'cote d\'ivoire': 'CI', cameroon: 'CM', ethiopia: 'ET', tanzania: 'TZ', uganda: 'UG', senegal: 'SN', egypt: 'EG', morocco: 'MA', angola: 'AO', mozambique: 'MZ', mauritius: 'MU', france: 'FR', germany: 'DE', italy: 'IT', spain: 'ES', portugal: 'PT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH', poland: 'PL', romania: 'RO', russia: 'RU', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', 'south korea': 'KR', malaysia: 'MY', thailand: 'TH', indonesia: 'ID', philippines: 'PH', vietnam: 'VN', nepal: 'NP', israel: 'IL', 'saudi arabia': 'SA', qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM', 'democratic republic of the congo': 'CD', 'republic of the congo': 'CG' };

function countryCode(value: string) { const trimmed = value.trim(); return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : aliases[trimmed.toLowerCase()] || null; }
export function getHomeDepartureAirport(country: string): Airport {
  const code = countryCode(country);
  if (!code) throw new Error('BIMED could not identify the candidate home country. Please update the recruitment profile before creating a travel itinerary.');
  const airport = HOME_AIRPORTS[code];
  if (!airport) throw new Error(`BIMED has not configured the single departure airport for ${country}. Admin must configure that country before an itinerary can be created.`);
  return airport;
}

function ageAt(dateOfBirth: string, travelDate: string) { const birth = new Date(`${dateOfBirth}T00:00:00Z`); const travel = new Date(`${travelDate}T00:00:00Z`); let age = travel.getUTCFullYear() - birth.getUTCFullYear(); const m = travel.getUTCMonth() - birth.getUTCMonth(); if (m < 0 || (m === 0 && travel.getUTCDate() < birth.getUTCDate())) age -= 1; return age; }
function validatePassengers(passengers: FlightPassengerInput[], travelDate: string) { if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > 3) throw new Error('BIMED can arrange a maximum of 3 passengers per travel request.'); const seen = new Set<string>(); for (const p of passengers) { if (!p.full_name || p.full_name.trim().length < 3) throw new Error('Every passenger needs a full legal name.'); if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)) throw new Error('Every passenger needs a valid date of birth.'); if (ageAt(p.date_of_birth, travelDate) < 0) throw new Error('Passenger date of birth cannot be after the travel date.'); const key = `${p.full_name.trim().toLowerCase()}|${p.date_of_birth}`; if (seen.has(key)) throw new Error('Duplicate passenger details were entered.'); seen.add(key); } }
function liveToken() { const token = process.env.DUFFEL_ACCESS_TOKEN || ''; if (!token) throw new Error('Live flight search is not configured yet. BIMED needs a live DUFFEL_ACCESS_TOKEN on the production service.'); if (token.startsWith('duffel_test_')) throw new Error('BIMED is still using a Duffel test token. Replace it with the live token before creating real-price itineraries.'); return token; }

export async function createVirtualFlightItinerary(input: { client: SupabaseClient; staff: any; permit: any; origin: Airport; travelDate: string; passengers: FlightPassengerInput[] }) {
  validatePassengers(input.passengers, input.travelDate); const token = liveToken();
  const passengerPayload = input.passengers.map((p) => { const age = ageAt(p.date_of_birth, input.travelDate); return { type: age < 2 ? 'infant_without_seat' : age < 12 ? 'child' : 'adult' }; });
  const response = await fetch(`${DUFFEL_API_URL}/air/offer_requests?return_offers=true&view=itineraries`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Duffel-Version': 'v2' }, body: JSON.stringify({ slices: [{ origin: input.origin.code, destination: DUBLIN.code, departure_date: input.travelDate }], passengers: passengerPayload, cabin_class: 'economy' }) });
  const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.errors?.[0]?.message || body?.message || 'The live flight provider could not return offers.');
  const offers = Array.isArray(body?.data?.offers) ? body.data.offers : [];
  const parsed = offers.map((offer: any) => { const segments = (offer.slices?.[0]?.segments || []).map((segment: any) => ({ marketing_carrier: segment.marketing_carrier?.name || '', operating_carrier: segment.operating_carrier?.name || '', flight_number: segment.marketing_carrier_flight_number || segment.flight_number || '', origin_code: segment.origin?.iata_code || '', origin_name: segment.origin?.name || '', destination_code: segment.destination?.iata_code || '', destination_name: segment.destination?.name || '', departing_at: segment.departing_at, arriving_at: segment.arriving_at, duration: segment.duration || null })); return { id: String(offer.id), total_amount: Number(offer.total_amount || 0), currency: offer.total_currency || 'EUR', expires_at: offer.expires_at || null, airline: segments[0]?.operating_carrier || segments[0]?.marketing_carrier || 'Airline', segments }; }).filter((offer: any) => offer.id && offer.total_amount > 0 && offer.segments.length).sort((a: any, b: any) => a.total_amount - b.total_amount);
  if (!parsed.length) throw new Error('No live economy flights were returned for this route and date. Choose another date.');
  const cheapest = parsed[0]; const now = new Date().toISOString(); const generated = { route: `${input.origin.code} → DUB`, origin_code: input.origin.code, origin_name: input.origin.name, destination_code: DUBLIN.code, destination_name: DUBLIN.name, home_country: input.origin.country_name, travel_date: input.travelDate, passenger_count: input.passengers.length, passengers: input.passengers, cabin_class: 'economy', airline: cheapest.airline, total_amount: cheapest.total_amount, currency: cheapest.currency, offer_id: cheapest.id, offer_expires_at: cheapest.expires_at, segments: cheapest.segments, alternatives: parsed.slice(1, 4).map((offer: any) => ({ offer_id: offer.id, airline: offer.airline, total_amount: offer.total_amount, currency: offer.currency, expires_at: offer.expires_at })), change_notice_hours: NOTICE_HOURS, airport_pickup_required: true, status: 'virtual', generated_at: now, provider: 'Duffel live flight offers' };
  const { data: saved, error } = await input.client.from('recruitment_flight_itineraries').upsert({ permit_case_id: input.permit.id, route: generated.route, departure_airport_code: generated.origin_code, departure_airport_name: generated.origin_name, destination_airport_code: generated.destination_code, destination_airport_name: generated.destination_name, travel_date: generated.travel_date, passenger_count: generated.passenger_count, cabin_class: 'economy', passengers: generated.passengers, status: 'virtual', airline_note: 'BIMED will book the cheapest suitable economy flight available at the time of actual booking.', change_notice_hours: NOTICE_HOURS, baggage_note: 'Any baggage above the airline economy allowance is the staff member’s responsibility and cost.', airport_pickup_included: true, updated_at: now }, { onConflict: 'permit_case_id' }).select('*').single();
  if (error || !saved) throw error || new Error('Unable to save the virtual itinerary.');
  await input.client.from('recruitment_staff_permit_cases').update({ flight_request_status: 'submitted', flight_request_submitted_at: now, flight_home_country: generated.home_country, flight_departure_airport_code: generated.origin_code, flight_departure_airport_name: generated.origin_name, flight_destination_airport_code: generated.destination_code, flight_destination_airport_name: generated.destination_name, flight_passenger_count: generated.passenger_count, flight_passengers: generated.passengers, flight_travel_date: generated.travel_date, flight_cabin_class: 'economy', flight_virtual_itinerary: generated, flight_itinerary_generated_at: now, flight_staff_notice_hours: NOTICE_HOURS, flight_airport_pickup_required: true, flight_updated_at: now, updated_at: now }).eq('id', input.permit.id);
  const message = `VIRTUAL FLIGHT ITINERARY REQUEST\n\nStaff: ${input.staff.full_name}\nBIMED ID: ${input.staff.bimed_id}\nHome-country departure: ${generated.origin_code} · ${generated.origin_name}\nDestination: DUB · Dublin Airport, Ireland\nTravel date: ${generated.travel_date}\nPassengers: ${generated.passenger_count}\nCabin: Economy\n\nLOWEST LIVE OFFER FOUND\nAirline: ${generated.airline}\nQuoted fare: ${generated.total_amount.toFixed(2)} ${generated.currency}\nOffer expires: ${generated.offer_expires_at || 'Provider did not return an expiry'}\n\n${generated.segments.map((s: any, i: number) => `${i + 1}. ${s.origin_code} ${s.origin_name} → ${s.destination_code} ${s.destination_name}\n   ${s.operating_carrier || s.marketing_carrier} ${s.flight_number} · depart ${s.departing_at} · arrive ${s.arriving_at}`).join('\n')}\n\nBIMED RULES\n• Virtual itinerary only. Staff do not book or pay for the flight. BIMED books after visa clearance.\n• BIMED may alter departure location or routing and will give up to 72 hours' notice where a change is required.\n• BIMED reserves the right to book the cheapest suitable economy fare available at actual booking time.\n• Maximum 3 passengers.\n• Baggage above the airline economy allowance is the staff member’s cost.\n• Airport pickup to BIMED accommodation is included in the travel plan.`;
  const { data: overseas } = await input.client.from('recruitment_staff').select('id').eq('email', 'overseas@bimedhealthcare.com').maybeSingle();
  if (overseas?.id) { const conversation = await getOrCreateDirectConversation(input.client, input.staff.id, overseas.id); const { data: msg } = await input.client.from('recruitment_staff_messages').insert({ conversation_id: conversation.id, sender_staff_id: input.staff.id, body: message }).select('id,created_at').single(); if (msg) await input.client.from('recruitment_staff_conversations').update({ last_message_at: msg.created_at, updated_at: msg.created_at }).eq('id', conversation.id); }
  return { itinerary: saved, generated, message };
}
