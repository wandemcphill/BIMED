import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateDirectConversation } from '@/lib/staff-messaging';

export const NOTICE_HOURS = 72;
export const DUBLIN = { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland' } as const;
export type FlightPassengerInput = { full_name: string; date_of_birth: string };
export type Airport = { code: string; name: string; city: string; country_code: string; country_name: string };

function ageAt(dob: string, date: string) {
  const b = new Date(`${dob}T00:00:00Z`);
  const t = new Date(`${date}T00:00:00Z`);
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  const m = t.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

function validate(passengers: FlightPassengerInput[], date: string) {
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > 3) {
    throw new Error('BIMED can arrange a maximum of 3 passengers per travel request.');
  }
  const seen = new Set<string>();
  for (const passenger of passengers) {
    const name = passenger.full_name?.trim();
    if (!name || name.length < 3) throw new Error('Every passenger needs a full legal name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.date_of_birth)) throw new Error('Every passenger needs a valid date of birth.');
    if (ageAt(passenger.date_of_birth, date) < 0) throw new Error('Passenger date of birth cannot be after the travel date.');
    const key = `${name.toLowerCase()}|${passenger.date_of_birth}`;
    if (seen.has(key)) throw new Error('Duplicate passenger details were entered.');
    seen.add(key);
  }
}

export async function submitFlightTravelRequest(input: {
  client: SupabaseClient;
  staff: any;
  permit: any;
  origin: Airport;
  travelDate: string;
  passengers: FlightPassengerInput[];
}) {
  validate(input.passengers, input.travelDate);
  const now = new Date().toISOString();
  const request = {
    route: `${input.origin.code} → DUB`,
    origin_code: input.origin.code,
    origin_name: input.origin.name,
    destination_code: DUBLIN.code,
    destination_name: DUBLIN.name,
    home_country: input.origin.country_name,
    travel_date: input.travelDate,
    passenger_count: input.passengers.length,
    passengers: input.passengers,
    cabin_class: 'economy',
    status: 'travel_request',
    change_notice_hours: NOTICE_HOURS,
    airport_pickup_required: true,
    submitted_at: now,
    booking_status: 'planning',
  };

  const { data: saved, error } = await input.client.from('recruitment_flight_itineraries').upsert({
    permit_case_id: input.permit.id,
    route: request.route,
    departure_airport_code: request.origin_code,
    departure_airport_name: request.origin_name,
    destination_airport_code: request.destination_code,
    destination_airport_name: request.destination_name,
    travel_date: request.travel_date,
    passenger_count: request.passenger_count,
    cabin_class: 'economy',
    passengers: request.passengers,
    status: 'virtual',
    airline_note: 'BIMED will select and book the appropriate economy flight after visa/immigration clearance. Staff are not shown supplier fares.',
    change_notice_hours: NOTICE_HOURS,
    baggage_note: 'Any baggage above the airline economy allowance is the staff member’s responsibility and cost.',
    airport_pickup_included: true,
    booking_status: 'planning',
    updated_at: now,
  }, { onConflict: 'permit_case_id' }).select('*').single();
  if (error || !saved) throw error || new Error('Unable to save the travel request.');

  await input.client.from('recruitment_staff_permit_cases').update({
    flight_request_status: 'submitted',
    flight_request_submitted_at: now,
    flight_home_country: request.home_country,
    flight_departure_airport_code: request.origin_code,
    flight_departure_airport_name: request.origin_name,
    flight_destination_airport_code: request.destination_code,
    flight_destination_airport_name: request.destination_name,
    flight_passenger_count: request.passenger_count,
    flight_passengers: request.passengers,
    flight_travel_date: request.travel_date,
    flight_cabin_class: 'economy',
    flight_virtual_itinerary: request,
    flight_itinerary_generated_at: now,
    flight_staff_notice_hours: NOTICE_HOURS,
    flight_airport_pickup_required: true,
    flight_updated_at: now,
    updated_at: now,
  }).eq('id', input.permit.id);

  await input.client.from('recruitment_arrival_transfers').upsert({
    permit_case_id: input.permit.id,
    itinerary_id: saved.id,
    status: 'pending_flight_booking',
    passenger_count: input.passengers.length,
    passenger_names: input.passengers.map((passenger) => passenger.full_name),
    pickup_airport_code: 'DUB',
    destination_name: 'BIMED accommodation',
    updated_at: now,
  }, { onConflict: 'permit_case_id' });

  const message = `OVERSEAS TRAVEL REQUEST\n\nStaff: ${input.staff.full_name}\nBIMED ID: ${input.staff.bimed_id}\nHome-country departure: ${request.origin_code} · ${request.origin_name}\nDestination: DUB · Dublin Airport, Ireland\nRequested travel date: ${request.travel_date}\nPassengers: ${request.passenger_count}\nCabin: Economy\nAirport pickup: Required to BIMED accommodation\n\nBIMED TRAVEL RULES\n• This is a travel request, not a ticket and not a price quote.\n• Staff do not book or pay for the flight. BIMED makes the actual booking after visa/immigration clearance.\n• BIMED may alter the departure airport, routing or flight location and will give up to 72 hours’ notice where practicable.\n• BIMED may select the most suitable economy routing available at booking time.\n• Maximum 3 passengers.\n• Baggage above the airline economy allowance is the staff member’s responsibility and cost.\n• Airport pickup from Dublin Airport to BIMED accommodation is included and will be arranged by BIMED.`;

  const { data: overseas } = await input.client.from('recruitment_staff').select('id').eq('email', 'overseas@bimedhealthcare.com').maybeSingle();
  if (overseas?.id) {
    const conversation = await getOrCreateDirectConversation(input.client, input.staff.id, overseas.id);
    const { data: msg } = await input.client.from('recruitment_staff_messages').insert({ conversation_id: conversation.id, sender_staff_id: input.staff.id, body: message }).select('id,created_at').single();
    if (msg) await input.client.from('recruitment_staff_conversations').update({ last_message_at: msg.created_at, updated_at: msg.created_at }).eq('id', conversation.id);
  }

  return { itinerary: saved, request, message };
}
