-- Resolve ordinary BIMED shift requests atomically.
-- A request approval and its corresponding shift mutation must commit together.

begin;

create or replace function public.bimed_resolve_staff_shift_request(
  p_request_id uuid,
  p_actor text,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.recruitment_shift_requests%rowtype;
  v_shift public.recruitment_workforce_shifts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'SHIFT_REQUEST_ACTOR_REQUIRED';
  end if;

  select *
    into v_request
  from public.recruitment_shift_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'SHIFT_REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'SHIFT_REQUEST_NOT_PENDING';
  end if;

  if v_request.request_type not in ('shift','cancellation') then
    raise exception 'SHIFT_REQUEST_TYPE_NOT_SUPPORTED';
  end if;

  select *
    into v_shift
  from public.recruitment_workforce_shifts
  where id = v_request.shift_id
  for update;

  if not found then
    raise exception 'SHIFT_NOT_FOUND';
  end if;

  if not p_approve then
    update public.recruitment_shift_requests
    set status = 'declined',
        responded_by = p_actor,
        responded_at = v_now,
        updated_at = v_now
    where id = v_request.id
    returning * into v_request;

    return jsonb_build_object(
      'request', to_jsonb(v_request),
      'shift', to_jsonb(v_shift)
    );
  end if;

  if v_request.request_type = 'shift' then
    if v_shift.status <> 'available' then
      raise exception 'SHIFT_NO_LONGER_AVAILABLE';
    end if;

    if v_shift.start_at <= v_now then
      raise exception 'SHIFT_ALREADY_STARTED';
    end if;

    if not public.bimed_staff_shift_eligible(v_request.staff_id) then
      raise exception 'STAFF_SHIFT_INELIGIBLE';
    end if;

    update public.recruitment_workforce_shifts
    set staff_id = v_request.staff_id,
        status = 'assigned',
        assigned_at = v_now,
        updated_at = v_now
    where id = v_shift.id
    returning * into v_shift;

  elsif v_request.request_type = 'cancellation' then
    if v_shift.staff_id <> v_request.staff_id then
      raise exception 'SHIFT_STAFF_MISMATCH';
    end if;

    if v_shift.status not in ('assigned','confirmed') then
      raise exception 'SHIFT_NOT_CANCELLABLE';
    end if;

    if v_shift.start_at <= v_now then
      raise exception 'SHIFT_ALREADY_STARTED';
    end if;

    update public.recruitment_workforce_shifts
    set status = 'cancelled',
        cancelled_at = v_now,
        cancellation_reason = coalesce(nullif(btrim(v_request.reason), ''), 'Cancellation approved by BIMED.'),
        updated_at = v_now
    where id = v_shift.id
    returning * into v_shift;
  end if;

  update public.recruitment_shift_requests
  set status = 'approved',
      responded_by = p_actor,
      responded_at = v_now,
      updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'shift', to_jsonb(v_shift)
  );
end;
$$;

revoke all on function public.bimed_resolve_staff_shift_request(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.bimed_resolve_staff_shift_request(uuid,text,boolean)
  to service_role;

commit;
