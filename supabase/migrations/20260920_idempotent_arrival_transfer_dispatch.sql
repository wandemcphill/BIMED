-- Make arrival-transfer supplier dispatch durable and retry-safe.
-- External email delivery remains outside the DB transaction, but the dispatch intent
-- and deterministic idempotency key are committed before the external side effect.

begin;

alter table public.recruitment_arrival_transfers
  add column if not exists supplier_dispatch_idempotency_key text;

create unique index if not exists recruitment_arrival_transfers_dispatch_key_uq
  on public.recruitment_arrival_transfers(supplier_dispatch_idempotency_key)
  where supplier_dispatch_idempotency_key is not null;

alter table public.recruitment_arrival_transfers
  drop constraint if exists recruitment_arrival_transfers_status_check;

alter table public.recruitment_arrival_transfers
  add constraint recruitment_arrival_transfers_status_check
  check (status in (
    'pending_flight_booking',
    'ready_to_dispatch',
    'dispatching',
    'supplier_requested',
    'supplier_confirmed',
    'driver_assigned',
    'en_route',
    'arrived',
    'completed',
    'cancelled',
    'failed'
  ));

create or replace function public.bimed_prepare_arrival_transfer_dispatch(
  p_transfer_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_itinerary public.recruitment_flight_itineraries%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_now timestamptz := clock_timestamp();
  v_key text;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ARRIVAL_TRANSFER_ACTOR_REQUIRED';
  end if;

  select * into v_transfer
  from public.recruitment_arrival_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'ARRIVAL_TRANSFER_NOT_FOUND';
  end if;

  select * into v_itinerary
  from public.recruitment_flight_itineraries
  where id = v_transfer.itinerary_id
  for update;

  if not found then
    raise exception 'ARRIVAL_TRANSFER_ITINERARY_NOT_FOUND';
  end if;

  select * into v_staff
  from public.recruitment_staff s
  join public.recruitment_staff_permit_cases p on p.staff_id = s.id
  where p.id = v_transfer.permit_case_id;

  if not found then
    raise exception 'ARRIVAL_TRANSFER_STAFF_NOT_FOUND';
  end if;

  if v_itinerary.booking_status <> 'booked' then
    raise exception 'ARRIVAL_TRANSFER_FLIGHT_NOT_BOOKED';
  end if;

  if nullif(btrim(v_transfer.destination_address), '') is null then
    raise exception 'ARRIVAL_TRANSFER_DESTINATION_REQUIRED';
  end if;

  if nullif(btrim(v_itinerary.flight_number), '') is null or v_itinerary.arrival_at is null then
    raise exception 'ARRIVAL_TRANSFER_FLIGHT_DETAILS_REQUIRED';
  end if;

  if v_transfer.supplier_request_message_id is not null
     or v_transfer.status in ('supplier_requested','supplier_confirmed','driver_assigned','en_route','arrived','completed') then
    raise exception 'ARRIVAL_TRANSFER_ALREADY_DISPATCHED';
  end if;

  v_key := coalesce(
    v_transfer.supplier_dispatch_idempotency_key,
    'arrival-transfer/' || v_transfer.id::text
  );

  update public.recruitment_arrival_transfers
  set status = 'dispatching',
      supplier_name = 'Avatravel',
      supplier_email = 'info@avatravel.ie',
      supplier_dispatch_idempotency_key = v_key,
      flight_number = v_itinerary.flight_number,
      flight_booking_reference = v_itinerary.booking_reference,
      flight_arrival_at = v_itinerary.arrival_at,
      passenger_count = v_itinerary.passenger_count,
      passenger_names = v_itinerary.passengers,
      last_error = null,
      updated_at = v_now
  where id = v_transfer.id
  returning * into v_transfer;

  insert into public.recruitment_staff_audit_log(
    staff_id, actor, event_type, metadata
  )
  values (
    v_staff.id,
    p_actor,
    'arrival_transfer_dispatch_started',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'idempotency_key', v_key,
      'flight_number', v_transfer.flight_number,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'transfer', to_jsonb(v_transfer),
    'idempotency_key', v_key
  );
end;
$$;

revoke all on function public.bimed_prepare_arrival_transfer_dispatch(uuid,text)
  from public, anon, authenticated;
grant execute on function public.bimed_prepare_arrival_transfer_dispatch(uuid,text)
  to service_role;


create or replace function public.bimed_complete_arrival_transfer_dispatch(
  p_transfer_id uuid,
  p_actor text,
  p_message_id text,
  p_sent_at timestamptz default null
)
returns public.recruitment_arrival_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_staff_id uuid;
  v_now timestamptz := coalesce(p_sent_at, clock_timestamp());
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ARRIVAL_TRANSFER_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(p_message_id), '') is null then
    raise exception 'ARRIVAL_TRANSFER_MESSAGE_ID_REQUIRED';
  end if;

  select * into v_transfer
  from public.recruitment_arrival_transfers
  where id = p_transfer_id
  for update;

  if not found then raise exception 'ARRIVAL_TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status <> 'dispatching' then
    raise exception 'ARRIVAL_TRANSFER_NOT_DISPATCHING';
  end if;

  update public.recruitment_arrival_transfers
  set status = 'supplier_requested',
      supplier_request_sent_at = v_now,
      supplier_request_message_id = p_message_id,
      last_error = null,
      updated_at = v_now
  where id = v_transfer.id
  returning * into v_transfer;

  select staff_id into v_staff_id
  from public.recruitment_staff_permit_cases
  where id = v_transfer.permit_case_id;

  insert into public.recruitment_staff_audit_log(
    staff_id, actor, event_type, metadata
  )
  values (
    v_staff_id,
    p_actor,
    'arrival_transfer_supplier_dispatched',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'message_id', p_message_id,
      'idempotency_key', v_transfer.supplier_dispatch_idempotency_key,
      'atomic_workflow', true
    )
  );

  return v_transfer;
end;
$$;

revoke all on function public.bimed_complete_arrival_transfer_dispatch(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.bimed_complete_arrival_transfer_dispatch(uuid,text,text,timestamptz)
  to service_role;


create or replace function public.bimed_fail_arrival_transfer_dispatch(
  p_transfer_id uuid,
  p_actor text,
  p_error text
)
returns public.recruitment_arrival_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_staff_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_transfer
  from public.recruitment_arrival_transfers
  where id = p_transfer_id
  for update;

  if not found then raise exception 'ARRIVAL_TRANSFER_NOT_FOUND'; end if;

  update public.recruitment_arrival_transfers
  set status = 'failed',
      last_error = left(coalesce(p_error, 'Supplier dispatch failed.'), 1000),
      updated_at = v_now
  where id = v_transfer.id
    and status = 'dispatching'
  returning * into v_transfer;

  if not found then raise exception 'ARRIVAL_TRANSFER_NOT_DISPATCHING'; end if;

  select staff_id into v_staff_id
  from public.recruitment_staff_permit_cases
  where id = v_transfer.permit_case_id;

  insert into public.recruitment_staff_audit_log(
    staff_id, actor, event_type, metadata
  )
  values (
    v_staff_id,
    p_actor,
    'arrival_transfer_dispatch_failed',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'error', left(coalesce(p_error, 'Supplier dispatch failed.'), 1000),
      'idempotency_key', v_transfer.supplier_dispatch_idempotency_key
    )
  );

  return v_transfer;
end;
$$;

revoke all on function public.bimed_fail_arrival_transfer_dispatch(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_fail_arrival_transfer_dispatch(uuid,text,text)
  to service_role;

commit;
