create or replace function public.bimed_activate_staff_account(
  p_email text,
  p_token_hash text,
  p_password_hash text,
  p_expected_session_version integer
)
returns table(
  staff_id uuid,
  bimed_id text,
  email text,
  status text,
  session_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.recruitment_staff%rowtype;
  now_value timestamptz := clock_timestamp();
  next_version integer;
begin
  select s.*
    into staff_row
    from public.recruitment_staff as s
   where s.activation_token_hash = p_token_hash
     and lower(s.email) = lower(trim(p_email))
   for update;

  if not found then
    raise exception 'ACTIVATION_INVALID';
  end if;

  if staff_row.session_version is distinct from p_expected_session_version then
    raise exception 'ACTIVATION_CHANGED';
  end if;

  if staff_row.activated_at is not null then
    raise exception 'ACTIVATION_USED';
  end if;

  if staff_row.activation_expires_at is null
     or staff_row.activation_expires_at <= now_value then
    raise exception 'ACTIVATION_EXPIRED';
  end if;

  if staff_row.status not in ('active', 'pre_arrival', 'on_leave') then
    raise exception 'ACTIVATION_NOT_ELIGIBLE';
  end if;

  next_version := greatest(coalesce(staff_row.session_version, 1), 1) + 1;

  update public.recruitment_staff
     set password_hash = p_password_hash,
         activation_token_hash = null,
         activation_expires_at = null,
         activated_at = now_value,
         session_version = next_version,
         updated_at = now_value
   where id = staff_row.id
   returning * into staff_row;

  insert into public.recruitment_staff_audit_log(
    staff_id,
    action,
    actor,
    event_type,
    metadata
  )
  values (
    staff_row.id,
    'staff_account_activated',
    staff_row.email,
    'staff_account_activated',
    jsonb_build_object(
      'activation_atomic', true,
      'session_version', next_version
    )
  );

  staff_id := staff_row.id;
  bimed_id := staff_row.bimed_id;
  email := staff_row.email;
  status := staff_row.status;
  session_version := staff_row.session_version;
  return next;
end;
$$;

revoke all on function public.bimed_activate_staff_account(text,text,text,integer)
  from public, anon, authenticated;

grant execute on function public.bimed_activate_staff_account(text,text,text,integer)
  to service_role;
