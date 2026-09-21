-- Serialize BIMED leave creation and approval on the staff row.
-- Prevents concurrent requests or approvals from creating overlapping active leave.

begin;

create or replace function public.bimed_request_staff_leave(
  p_staff_id uuid,
  p_actor text,
  p_start_date date,
  p_end_date date,
  p_leave_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.recruitment_staff%rowtype;
  v_request public.recruitment_leave_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'LEAVE_REQUEST_ACTOR_REQUIRED'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'INVALID_LEAVE_DATE_RANGE';
  end if;

  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.status <> 'active' then raise exception 'STAFF_NOT_ELIGIBLE_FOR_LEAVE'; end if;

  if exists (
    select 1
    from public.recruitment_leave_requests
    where staff_id = p_staff_id
      and status in ('pending','approved')
      and start_date <= p_end_date
      and end_date >= p_start_date
  ) then
    raise exception 'LEAVE_OVERLAP';
  end if;

  insert into public.recruitment_leave_requests(
    staff_id,start_date,end_date,leave_type,status,reason,created_at,updated_at
  )
  values (
    p_staff_id,p_start_date,p_end_date,
    coalesce(nullif(btrim(p_leave_type), ''), 'annual'),
    'pending',
    nullif(btrim(p_reason), ''),
    v_now,v_now
  )
  returning * into v_request;

  insert into public.recruitment_staff_audit_log(
    staff_id,action,actor,event_type,metadata
  )
  values (
    p_staff_id,
    'leave_requested',
    p_actor,
    'leave_requested_atomic',
    jsonb_build_object(
      'leave_request_id', v_request.id,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'leave_type', v_request.leave_type,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object('leave_request',to_jsonb(v_request));
end;
$$;

revoke all on function public.bimed_request_staff_leave(uuid,text,date,date,text,text)
  from public,anon,authenticated;
grant execute on function public.bimed_request_staff_leave(uuid,text,date,date,text,text)
  to service_role;


create or replace function public.bimed_resolve_staff_leave_request(
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
  v_request public.recruitment_leave_requests%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'LEAVE_REQUEST_ACTOR_REQUIRED'; end if;

  select * into v_request
  from public.recruitment_leave_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'LEAVE_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception 'LEAVE_REQUEST_NOT_PENDING'; end if;

  select * into v_staff
  from public.recruitment_staff
  where id = v_request.staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;

  if p_approve then
    if exists (
      select 1
      from public.recruitment_leave_requests
      where staff_id = v_request.staff_id
        and id <> v_request.id
        and status in ('pending','approved')
        and start_date <= v_request.end_date
        and end_date >= v_request.start_date
    ) then
      raise exception 'LEAVE_OVERLAP';
    end if;

    update public.recruitment_leave_requests
    set status='approved',
        responded_by=p_actor,
        responded_at=v_now,
        updated_at=v_now
    where id=v_request.id
    returning * into v_request;
  else
    update public.recruitment_leave_requests
    set status='declined',
        responded_by=p_actor,
        responded_at=v_now,
        updated_at=v_now
    where id=v_request.id
    returning * into v_request;
  end if;

  insert into public.recruitment_staff_audit_log(
    staff_id,action,actor,event_type,metadata
  )
  values (
    v_staff.id,
    case when p_approve then 'leave_request_approved' else 'leave_request_declined' end,
    p_actor,
    case when p_approve then 'leave_request_approved_atomic' else 'leave_request_declined_atomic' end,
    jsonb_build_object(
      'leave_request_id',v_request.id,
      'start_date',v_request.start_date,
      'end_date',v_request.end_date,
      'leave_type',v_request.leave_type,
      'atomic_workflow',true
    )
  );

  return jsonb_build_object('leave_request',to_jsonb(v_request));
end;
$$;

revoke all on function public.bimed_resolve_staff_leave_request(uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.bimed_resolve_staff_leave_request(uuid,text,boolean)
  to service_role;

commit;
