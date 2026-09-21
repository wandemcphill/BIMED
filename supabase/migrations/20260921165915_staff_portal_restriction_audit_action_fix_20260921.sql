create or replace function public.bimed_restrict_staff_portal(
  p_staff_id uuid,
  p_actor text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_staff public.recruitment_staff%rowtype;
  v_now timestamptz := clock_timestamp();
  v_new_version integer;
begin
  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if v_staff.application_id is null then
    raise exception 'STAFF_NOT_RECRUITMENT_LINKED';
  end if;

  if v_staff.status = 'suspended' then
    raise exception 'STAFF_ALREADY_SUSPENDED';
  end if;

  v_new_version := greatest(coalesce(v_staff.session_version, 1) + 1, 2);

  update public.recruitment_staff
  set
    status = 'suspended',
    portal_previous_status = v_staff.status,
    portal_restriction_reason = 'accommodation_nonpayment',
    portal_restricted_at = v_now,
    portal_restricted_by = p_actor,
    portal_restriction_message = p_message,
    session_version = v_new_version,
    updated_at = v_now
  where id = p_staff_id;

  insert into public.recruitment_staff_audit_log(
    staff_id,
    action,
    actor,
    event_type,
    metadata
  )
  values (
    p_staff_id,
    'staff_portal_restricted',
    p_actor,
    'staff_portal_restricted',
    jsonb_build_object(
      'reason',
      'accommodation_nonpayment',
      'previous_status',
      v_staff.status,
      'atomic_workflow',
      true
    )
  );

  return jsonb_build_object(
    'staff_id',
    p_staff_id,
    'status',
    'suspended',
    'session_version',
    v_new_version
  );
end;
$function$;

create or replace function public.bimed_reactivate_staff_portal(
  p_staff_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_staff public.recruitment_staff%rowtype;
  v_restored_status text;
  v_now timestamptz := clock_timestamp();
  v_new_version integer;
begin
  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if v_staff.status <> 'suspended'
     or v_staff.portal_restriction_reason <> 'accommodation_nonpayment' then
    raise exception 'STAFF_NOT_ACCOMMODATION_RESTRICTED';
  end if;

  v_restored_status := case
    when v_staff.portal_previous_status in ('pre_arrival', 'active', 'on_leave')
      then v_staff.portal_previous_status
    else 'pre_arrival'
  end;

  v_new_version := greatest(coalesce(v_staff.session_version, 1) + 1, 2);

  update public.recruitment_staff
  set
    status = v_restored_status,
    portal_restriction_reason = null,
    portal_restricted_at = null,
    portal_restricted_by = null,
    portal_restriction_message = null,
    portal_previous_status = null,
    session_version = v_new_version,
    updated_at = v_now
  where id = p_staff_id;

  insert into public.recruitment_staff_audit_log(
    staff_id,
    action,
    actor,
    event_type,
    metadata
  )
  values (
    p_staff_id,
    'staff_portal_reactivated',
    p_actor,
    'staff_portal_reactivated',
    jsonb_build_object(
      'restored_status',
      v_restored_status,
      'atomic_workflow',
      true
    )
  );

  return jsonb_build_object(
    'staff_id',
    p_staff_id,
    'status',
    v_restored_status,
    'session_version',
    v_new_version
  );
end;
$function$;

revoke all on function public.bimed_restrict_staff_portal(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_restrict_staff_portal(uuid,text,text)
  to service_role;

revoke all on function public.bimed_reactivate_staff_portal(uuid,text)
  from public, anon, authenticated;
grant execute on function public.bimed_reactivate_staff_portal(uuid,text)
  to service_role;
