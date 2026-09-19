-- Make the overseas flight-request and flight-booking database writes atomic.
-- External notifications remain post-commit side effects.

begin;

create or replace function public.bimed_submit_staff_flight_request(
  p_permit_case_id uuid,
  p_staff_id uuid,
  p_route text,
  p_origin_code text,
  p_origin_name text,
  p_home_country text,
  p_travel_date date,
  p_passenger_count integer,
  p_passengers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_itinerary public.recruitment_flight_itineraries%rowtype;
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 3 then
    raise exception 'BIMED can arrange a maximum of 3 passengers per travel request.';
  end if;

  if jsonb_typeof(coalesce(p_passengers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_passengers, '[]'::jsonb)) <> p_passenger_count then
    raise exception 'Passenger details do not match the passenger count.';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = p_permit_case_id
    and staff_id = p_staff_id
  for update;

  if not found then
    raise exception 'OVERSEAS_PERMIT_CASE_NOT_FOUND';
  end if;

  select *
    into v_itinerary
  from public.recruitment_flight_itineraries
  where permit_case_id = p_permit_case_id
  for update;

  if found and v_itinerary.booking_status = 'booked' then
    raise exception 'Your flight has already been booked by BIMED. Further travel changes must be handled by Overseas Recruitment.';
  end if;

  if found and v_itinerary.booking_status = 'cancelled' then
    raise exception 'This travel request has been cancelled by BIMED. Contact Overseas Recruitment before submitting another request.';
  end if;

  insert into public.recruitment_flight_itineraries(
    permit_case_id,
    route,
    departure_airport_code,
    departure_airport_name,
    destination_airport_code,
    destination_airport_name,
    travel_date,
    passenger_count,
    cabin_class,
    passengers,
    status,
    airline_note,
    change_notice_hours,
    baggage_note,
    airport_pickup_included,
    booking_status,
    updated_at
  )
  values (
    p_permit_case_id,
    p_route,
    p_origin_code,
    p_origin_name,
    'DUB',
    'Dublin Airport',
    p_travel_date,
    p_passenger_count,
    'economy',
    p_passengers,
    'virtual',
    'BIMED will select and book the appropriate economy flight after visa/immigration clearance. Staff are not shown supplier fares.',
    72,
    'Any baggage above the airline economy allowance is the staff member''s responsibility and cost.',
    true,
    'planning',
    v_now
  )
  on conflict (permit_case_id) do update
  set route = excluded.route,
      departure_airport_code = excluded.departure_airport_code,
      departure_airport_name = excluded.departure_airport_name,
      destination_airport_code = excluded.destination_airport_code,
      destination_airport_name = excluded.destination_airport_name,
      travel_date = excluded.travel_date,
      passenger_count = excluded.passenger_count,
      cabin_class = excluded.cabin_class,
      passengers = excluded.passengers,
      status = 'virtual',
      airline_note = excluded.airline_note,
      change_notice_hours = excluded.change_notice_hours,
      baggage_note = excluded.baggage_note,
      airport_pickup_included = true,
      booking_status = 'planning',
      updated_at = v_now
  returning * into v_itinerary;

  update public.recruitment_staff_permit_cases
  set flight_request_status = 'submitted',
      flight_request_submitted_at = v_now,
      flight_home_country = p_home_country,
      flight_departure_airport_code = p_origin_code,
      flight_departure_airport_name = p_origin_name,
      flight_destination_airport_code = 'DUB',
      flight_destination_airport_name = 'Dublin Airport',
      flight_passenger_count = p_passenger_count,
      flight_passengers = p_passengers,
      flight_travel_date = p_travel_date,
      flight_cabin_class = 'economy',
      flight_virtual_itinerary = jsonb_build_object(
        'route', p_route,
        'origin_code', p_origin_code,
        'origin_name', p_origin_name,
        'destination_code', 'DUB',
        'destination_name', 'Dublin Airport',
        'home_country', p_home_country,
        'travel_date', p_travel_date,
        'passenger_count', p_passenger_count,
        'passengers', p_passengers,
        'cabin_class', 'economy',
        'booking_status', 'planning'
      ),
      flight_itinerary_generated_at = v_now,
      flight_staff_notice_hours = 72,
      flight_airport_pickup_required = true,
      flight_updated_at = v_now,
      updated_at = v_now
  where id = p_permit_case_id
  returning * into v_permit;

  insert into public.recruitment_arrival_transfers(
    permit_case_id,
    itinerary_id,
    status,
    pickup_airport_code,
    destination_name,
    passenger_count,
    passenger_names,
    updated_at
  )
  values (
    p_permit_case_id,
    v_itinerary.id,
    'pending_flight_booking',
    'DUB',
    'BIMED accommodation',
    p_passenger_count,
    p_passengers,
    v_now
  )
  on conflict (permit_case_id) do update
  set itinerary_id = excluded.itinerary_id,
      status = case
        when public.recruitment_arrival_transfers.status in ('supplier_requested','supplier_confirmed','driver_assigned','en_route','arrived','completed')
          then public.recruitment_arrival_transfers.status
        else 'pending_flight_booking'
      end,
      pickup_airport_code = 'DUB',
      passenger_count = excluded.passenger_count,
      passenger_names = excluded.passenger_names,
      updated_at = v_now
  returning * into v_transfer;

  return jsonb_build_object(
    'itinerary', to_jsonb(v_itinerary),
    'permit', to_jsonb(v_permit),
    'transfer', to_jsonb(v_transfer)
  );
end;
$$;

revoke all on function public.bimed_submit_staff_flight_request(uuid,uuid,text,text,text,text,date,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.bimed_submit_staff_flight_request(uuid,uuid,text,text,text,text,date,integer,jsonb)
  to service_role;


create or replace function public.bimed_confirm_staff_flight_booking(
  p_permit_case_id uuid,
  p_actor text,
  p_flight_number text,
  p_arrival_at timestamptz,
  p_booking_reference text,
  p_airline text,
  p_booking_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_itinerary public.recruitment_flight_itineraries%rowtype;
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_flight_number), '') is null or p_arrival_at is null then
    raise exception 'FLIGHT_CONFIRMATION_DETAILS_REQUIRED';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = p_permit_case_id
  for update;

  if not found then
    raise exception 'OVERSEAS_PERMIT_CASE_NOT_FOUND';
  end if;

  if not (
    v_permit.status = 'visa_granted'
    or v_permit.visa_status = 'granted'
    or v_permit.work_authorised is true
  ) then
    raise exception 'FLIGHT_BOOKING_CLEARANCE_REQUIRED';
  end if;

  select *
    into v_itinerary
  from public.recruitment_flight_itineraries
  where permit_case_id = p_permit_case_id
  for update;

  if not found then
    raise exception 'TRAVEL_REQUEST_NOT_FOUND';
  end if;

  if v_itinerary.booking_status = 'cancelled' then
    raise exception 'TRAVEL_REQUEST_CANCELLED';
  end if;

  update public.recruitment_flight_itineraries
  set booking_status = 'booked',
      status = 'booked',
      booking_reference = nullif(btrim(p_booking_reference), ''),
      airline = nullif(btrim(p_airline), ''),
      flight_number = btrim(p_flight_number),
      arrival_at = p_arrival_at,
      booked_at = v_now,
      booking_notes = nullif(btrim(p_booking_notes), ''),
      updated_at = v_now
  where id = v_itinerary.id
  returning * into v_itinerary;

  insert into public.recruitment_arrival_transfers(
    permit_case_id,
    itinerary_id,
    status,
    pickup_airport_code,
    passenger_count,
    passenger_names,
    flight_number,
    flight_booking_reference,
    flight_arrival_at,
    updated_at
  )
  values (
    p_permit_case_id,
    v_itinerary.id,
    'ready_to_dispatch',
    'DUB',
    v_itinerary.passenger_count,
    v_itinerary.passengers,
    v_itinerary.flight_number,
    v_itinerary.booking_reference,
    v_itinerary.arrival_at,
    v_now
  )
  on conflict (permit_case_id) do update
  set itinerary_id = excluded.itinerary_id,
      status = case
        when public.recruitment_arrival_transfers.status in ('supplier_requested','supplier_confirmed','driver_assigned','en_route','arrived','completed','cancelled')
          then public.recruitment_arrival_transfers.status
        else 'ready_to_dispatch'
      end,
      passenger_count = excluded.passenger_count,
      passenger_names = excluded.passenger_names,
      flight_number = excluded.flight_number,
      flight_booking_reference = excluded.flight_booking_reference,
      flight_arrival_at = excluded.flight_arrival_at,
      updated_at = v_now
  returning * into v_transfer;

  update public.recruitment_staff_permit_cases
  set flight_request_status = 'booked',
      flight_virtual_itinerary = coalesce(flight_virtual_itinerary, '{}'::jsonb) || jsonb_build_object(
        'status', 'booked',
        'flight_number', v_itinerary.flight_number,
        'booking_reference', v_itinerary.booking_reference,
        'airline', v_itinerary.airline,
        'arrival_at', v_itinerary.arrival_at
      ),
      flight_updated_at = v_now,
      updated_at = v_now
  where id = p_permit_case_id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(staff_id, actor, event_type, metadata)
  values(
    v_permit.staff_id,
    p_actor,
    'flight_booked_by_bimed',
    jsonb_build_object(
      'flight_number', v_itinerary.flight_number,
      'booking_reference', v_itinerary.booking_reference,
      'arrival_at', v_itinerary.arrival_at,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'itinerary', to_jsonb(v_itinerary),
    'permit', to_jsonb(v_permit),
    'transfer', to_jsonb(v_transfer)
  );
end;
$$;

revoke all on function public.bimed_confirm_staff_flight_booking(uuid,text,text,timestamptz,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_confirm_staff_flight_booking(uuid,text,text,timestamptz,text,text,text)
  to service_role;

commit;
