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
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > 3) throw new Error('BIMED can arrange a maximum of 3 passengers per travel request.');
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

export async function submitFlightTravelRequest(input: { client: SupabaseClient; staff: any; permit: any; origin: Airport; travelDate: string; passengers: FlightPassengerInput[] }) {
  validate(input.passengers, input.travelDate);
  const { data: existingItinerary, error: existingError } = await input.client.from('recruitment_flight_itineraries').select('booking_status,status').eq('permit_case_id', input.permit.id).maybeSingle();
  if (existingError) throw existingError;
  if (existingItinerary?.booking_status === 'booked') throw new Error('Your flight has already been booked by BIMED. Further travel changes must be handled by Overseas Recruitment.');
  if (existingItinerary?.booking_status === 'cancelled') throw new Error('This travel request has been cancelled by BIMED. Contact Overseas Recruitment before submitting another request.');

  const request = {
    route: `${input.origin.code} → DUB`, origin_code: input.origin.code, origin_name: input.origin.name, destination_code: DUBLIN.code, destination_name: DUBLIN.name,
    home_country: input.origin.country_name, travel_date: input.travelDate, passenger_count: input.passengers.length, passengers: input.passengers, cabin_class: 'economy', change_notice_hours: NOTICE_HOURS,
    airport_pickup_required: true,
  };

  const { data: atomicResult, error: atomicError } = await input.client.rpc('bimed_submit_staff_flight_request', {
    p_permit_case_id: input.permit.id,
    p_staff_id: input.staff.id,
    p_route: request.route,
    p_origin_code: request.origin_code,
    p_origin_name: request.origin_name,
    p_home_country: request.home_country,
    p_travel_date: request.travel_date,
    p_passenger_count: request.passenger_count,
    p_passengers: request.passengers,
  });
  if (atomicError || !atomicResult) throw atomicError || new Error('Unable to save the travel request.');

  const saved = atomicResult.itinerary;
  const transfer = atomicResult.transfer;
  const message = `OVERSEAS TRAVEL REQUEST\n\nStaff: ${input.staff.full_name}\nBIMED ID: ${input.staff.bimed_id}\nHome-country departure: ${request.origin_code} · ${request.origin_name}\nDestination: DUB · Dublin Airport, Ireland\nRequested travel date: ${request.travel_date}\nPassengers: ${request.passenger_count}\nCabin: Economy\nAirport pickup: Required to BIMED accommodation\n\nBIMED TRAVEL RULES\n• This is a travel request, not a ticket and not a price quote.\n• Staff do not book or pay for the flight. BIMED makes the actual booking after visa/immigration clearance.\n• BIMED may alter the departure airport, routing or flight location and will give up to 72 hours’ notice where practicable.\n• BIMED may select the most suitable economy routing available at booking time.\n• Maximum 3 passengers.\n• Baggage above the airline economy allowance is the staff member’s responsibility and cost.\n• Airport pickup from Dublin Airport to BIMED accommodation is included and will be arranged by BIMED.`;

  const { data: overseas } = await input.client.from('recruitment_staff').select('id').eq('email', 'overseas@bimedhealthcare.com').maybeSingle();
  if (overseas?.id) {
    const conversation = await getOrCreateDirectConversation(input.client, input.staff.id, overseas.id);
    const { data: msg } = await input.client.from('recruitment_staff_messages').insert({ conversation_id: conversation.id, sender_staff_id: input.staff.id, body: message }).select('id,created_at').single();
    if (msg) await input.client.from('recruitment_staff_conversations').update({ last_message_at: msg.created_at, updated_at: msg.created_at }).eq('id', conversation.id);
  }

  return { itinerary: saved, request, message };
}
