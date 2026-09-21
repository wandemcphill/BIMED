-- Fix NULL-safe flight booking clearance evaluation.
-- A nullable visa_status must never allow the clearance guard to fall through.

begin;

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
    or coalesce(v_permit.visa_status, '') = 'granted'
    or coalesce(v_permit.work_authorised, false) = true
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