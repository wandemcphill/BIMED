-- Prevent BIMED from assigning or confirming rota shifts to staff who are not currently eligible to work.
-- The application layer already checks this, but the invariant must also hold for direct
-- service-role writes and the existing atomic shift-swap RPC.

begin;

create or replace function public.bimed_staff_shift_eligible(p_staff_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_status text;
  v_work_authorised boolean;
  v_shift_eligibility text;
begin
  select status
    into v_staff_status
  from public.recruitment_staff
  where id = p_staff_id;

  if not found or v_staff_status <> 'active' then
    return false;
  end if;

  select work_authorised, shift_eligibility
    into v_work_authorised, v_shift_eligibility
  from public.recruitment_staff_permit_cases
  where staff_id = p_staff_id;

  if not found then
    return true;
  end if;

  return v_work_authorised is true
     and v_shift_eligibility = 'eligible';
end;
$$;

revoke all on function public.bimed_staff_shift_eligible(uuid) from public, anon, authenticated, service_role;

create or replace function public.bimed_guard_workforce_shift_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is not null
     and new.status in ('assigned', 'confirmed')
     and not public.bimed_staff_shift_eligible(new.staff_id) then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_SHIFT_INELIGIBLE';
  end if;

  return new;
end;
$$;

revoke all on function public.bimed_guard_workforce_shift_assignment() from public, anon, authenticated, service_role;

drop trigger if exists workforce_shift_eligibility_guard on public.recruitment_workforce_shifts;

create trigger workforce_shift_eligibility_guard
before insert or update of staff_id, status
on public.recruitment_workforce_shifts
for each row
execute function public.bimed_guard_workforce_shift_assignment();

commit;
