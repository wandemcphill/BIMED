-- Resolve an exact BIMED ID or BIMED email to a staff record.

begin;
create or replace function public.bimed_resolve_staff_for_accommodation_share(
  p_identifier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
begin
  if v_identifier = '' then
    raise exception 'SHARED_PARTNER_IDENTIFIER_REQUIRED';
  end if;

  select s.id
    into v_staff_id
  from public.recruitment_staff s
  left join public.recruitment_applications a on a.id = s.application_id
  where lower(trim(s.bimed_id)) = v_identifier
     or lower(trim(coalesce(s.email, ''))) = v_identifier
     or lower(trim(coalesce(a.email, ''))) = v_identifier
  order by case when lower(trim(s.bimed_id)) = v_identifier then 0 else 1 end
  limit 1;

  if v_staff_id is null then
    raise exception 'SHARED_PARTNER_NOT_FOUND';
  end if;

  return v_staff_id;
end;
$$;


revoke all on function public.bimed_resolve_staff_for_accommodation_share(text)
  from public, anon, authenticated;
grant execute on function public.bimed_resolve_staff_for_accommodation_share(text)
  to service_role;

commit;
