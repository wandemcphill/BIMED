import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { submitFlightTravelRequest } from '@/lib/flight-travel-request';
import { resolveWorldwideHomeAirport } from '@/lib/worldwide-home-airport';

function getDate(value: unknown) {
  const date = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid travel date.');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Choose a valid travel date.');
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  if (parsed < today) throw new Error('Travel date cannot be in the past.');
  return date;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,status,application_id').eq('id', session.staff_id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  if (staff.status !== 'pre_arrival' || !staff.application_id) return NextResponse.json({ error: 'The overseas travel workspace is only available to overseas recruitment-linked new hires.' }, { status: 403 });
  const [{ data: application }, { data: permit }] = await Promise.all([
    client.from('recruitment_applications').select('country_of_residence,nationality').eq('id', staff.application_id).maybeSingle(),
    client.from('recruitment_staff_permit_cases').select('id,flight_request_status,flight_home_country,flight_departure_airport_code,flight_departure_airport_name,flight_destination_airport_code,flight_destination_airport_name,flight_passenger_count,flight_passengers,flight_travel_date,flight_cabin_class,flight_virtual_itinerary,flight_itinerary_generated_at,flight_staff_notice_hours,flight_airport_pickup_required').eq('staff_id', staff.id).maybeSingle(),
  ]);
  if (!permit) return NextResponse.json({ error: 'Overseas permit case not initialized.' }, { status: 404 });
  try {
    const origin = await resolveWorldwideHomeAirport(String(application?.country_of_residence || ''));
    const { data: saved } = await client.from('recruitment_flight_itineraries').select('id,permit_case_id,route,departure_airport_code,departure_airport_name,destination_airport_code,destination_airport_name,travel_date,passenger_count,cabin_class,passengers,status,airline_note,change_notice_hours,baggage_note,airport_pickup_included,booking_status,airline,flight_number,booking_reference,arrival_at,booked_at').eq('permit_case_id', permit.id).maybeSingle();
    const { data: pickup } = await client.from('recruitment_arrival_transfers').select('status,pickup_airport_code,destination_name,supplier_name,supplier_confirmed_at,driver_name,driver_phone,vehicle_description,driver_meet_point').eq('permit_case_id', permit.id).maybeSingle();
    return NextResponse.json({ homeCountry: application?.country_of_residence || null, origin, destination: { code: 'DUB', name: 'Dublin Airport', country: 'Ireland' }, permit, itinerary: saved || null, pickup: pickup || null });
  } catch (error) {
    return NextResponse.json({ homeCountry: application?.country_of_residence || null, origin: null, destination: { code: 'DUB', name: 'Dublin Airport', country: 'Ireland' }, permit, itinerary: null, pickup: null, warning: error instanceof Error ? error.message : 'Unable to resolve the home-country airport.' });
  }
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `staff-travel-submit:${session.staff_id}`, limit: 10, windowMs: 60 * 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'Travel requests are temporarily rate-limited. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });
  const body = await request.json().catch(() => null) as any;
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,status,application_id').eq('id', session.staff_id).maybeSingle();
  if (!staff || staff.status !== 'pre_arrival' || !staff.application_id) return NextResponse.json({ error: 'The overseas travel workspace is only available to overseas recruitment-linked new hires.' }, { status: 403 });
  const [{ data: application }, { data: permit }] = await Promise.all([
    client.from('recruitment_applications').select('country_of_residence').eq('id', staff.application_id).maybeSingle(),
    client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle(),
  ]);
  if (!permit) return NextResponse.json({ error: 'Overseas permit case not initialized.' }, { status: 404 });
  try {
    const travelDate = getDate(body?.travel_date);
    const passengers = Array.isArray(body?.passengers) ? body.passengers.slice(0, 3).map((passenger: any) => ({ full_name: String(passenger?.full_name || '').trim(), date_of_birth: String(passenger?.date_of_birth || '').trim() })) : [];
    if (!application?.country_of_residence) throw new Error('Your home country is missing from the recruitment profile. BIMED must update it before a travel request can be submitted.');
    const origin = await resolveWorldwideHomeAirport(application.country_of_residence);
    const result = await submitFlightTravelRequest({ client, staff, permit, origin, travelDate, passengers });
    await createStaffNotification(client, { staffId: staff.id, category: 'travel', title: 'Travel request sent to BIMED', body: `Your economy travel request from ${origin.code} to Dublin for ${travelDate} has been sent to Overseas Recruitment. BIMED will handle the actual flight booking and airport pickup after clearance.`, actionUrl: '/staff/travel' });
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'flight_travel_request_submitted', metadata: { origin: origin.code, destination: 'DUB', travel_date: travelDate, passenger_count: passengers.length, provider: 'BIMED booking workflow' } });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to submit the travel request.' }, { status: 400 });
  }
}
