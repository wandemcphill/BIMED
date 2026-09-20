-- Canonical arrival-transfer operational state machine.
-- Admin updates must follow the same dispatch lifecycle used by the supplier workflow.

begin;

create or replace function public.bimed_transition_arrival_transfer_status(
  p_transfer_id uuid,
  p_actor text,
  p_to_status text,
  p_patch jsonb default '{}'::jsonb
)
returns public.recruitment_arrival_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.recruitment_arrival_transfers%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_from_status text;
  v_now timestamptz := clock_timestamp();
  v_allowed boolean := false;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ARRIVAL_TRANSFER_ACTOR_REQUIRED';
  end if;

  if p_to_status is null or p_to_status not in (
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
  ) then
    raise exception 'INVALID_ARRIVAL_TRANSFER_STATUS';
  end if;

  select * into v_transfer
  from public.recruitment_arrival_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'ARRIVAL_TRANSFER_NOT_FOUND';
  end if;

  v_from_status := v_transfer.status;

  if v_from_status = p_to_status then
    v_allowed := true;
  elsif v_from_status = 'pending_flight_booking' and p_to_status in ('ready_to_dispatch','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'ready_to_dispatch' and p_to_status in ('pending_flight_booking','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'dispatching' and p_to_status in ('supplier_requested','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'supplier_requested' and p_to_status in ('supplier_confirmed','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'supplier_confirmed' and p_to_status in ('driver_assigned','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'driver_assigned' and p_to_status in ('en_route','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'en_route' and p_to_status in ('arrived','failed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'arrived' and p_to_status in ('completed','cancelled') then
    v_allowed := true;
  elsif v_from_status = 'failed' and p_to_status in ('ready_to_dispatch','pending_flight_booking','cancelled') then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'ARRIVAL_TRANSFER_STATUS_TRANSITION_BLOCKED';
  end if;

  if p_to_status in ('dispatching','supplier_requested')
     and v_transfer.itinerary_id is null then
    raise exception 'ARRIVAL_TRANSFER_ITINERARY_REQUIRED';
  end if;

  update public.recruitment_arrival_transfers
  set status = p_to_status,
      supplier_booking_reference = case when p_patch ? 'supplier_booking_reference'
        then nullif(btrim(p_patch->>'supplier_booking_reference'), '')
        else supplier_booking_reference end,
      driver_name = case when p_patch ? 'driver_name'
        then nullif(btrim(p_patch->>'driver_name'), '')
        else driver_name end,
      driver_phone = case when p_patch ? 'driver_phone'
        then nullif(btrim(p_patch->>'driver_phone'), '')
        else driver_phone end,
      vehicle_description = case when p_patch ? 'vehicle_description'
        then nullif(btrim(p_patch->>'vehicle_description'), '')
        else vehicle_description end,
      driver_meet_point = case when p_patch ? 'driver_meet_point'
        then nullif(btrim(p_patch->>'driver_meet_point'), '')
        else driver_meet_point end,
      supplier_status_note = case when p_patch ? 'supplier_status_note'
        then nullif(btrim(p_patch->>'supplier_status_note'), '')
        else supplier_status_note end,
      supplier_confirmed_at = case
        when p_to_status = 'supplier_confirmed' and supplier_confirmed_at is null then v_now
        else supplier_confirmed_at
      end,
      completed_at = case
        when p_to_status = 'completed' and completed_at is null then v_now
        else completed_at
      end,
      cancelled_at = case
        when p_to_status = 'cancelled' and cancelled_at is null then v_now
        else cancelled_at
      end,
      last_error = case
        when p_to_status = 'failed' then nullif(btrim(coalesce(p_patch->>'error', last_error, 'Dispatch or supplier operation failed.')), '')
        when p_to_status not in ('failed') then case when p_patch ? 'error' then nullif(btrim(p_patch->>'error'), '') else null end
        else last_error
      end,
      updated_at = v_now
  where id = v_transfer.id
  returning * into v_transfer;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where id = v_transfer.permit_case_id;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_permit.staff_id,
    'arrival_transfer_status_updated',
    p_actor,
    'arrival_transfer_status_transition',
    jsonb_build_object(
      'transfer_id', v_transfer.id,
      'from_status', v_from_status,
      'to_status', p_to_status,
      'supplier_booking_reference', v_transfer.supplier_booking_reference,
      'atomic_workflow', true
    )
  );

  return v_transfer;
end;
$$;

revoke all on function public.bimed_transition_arrival_transfer_status(uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.bimed_transition_arrival_transfer_status(uuid,text,text,jsonb)
  to service_role;

commit;
