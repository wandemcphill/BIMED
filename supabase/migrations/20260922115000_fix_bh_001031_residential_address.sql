-- Correct the known residential country/address typo for BH-001031.
-- The portal previously displayed ", Ireland" for a Nigerian residential address.
-- This migration is intentionally idempotent and only targets the named BIMED identity.

do $$
declare
  v_staff_id uuid;
  v_application_id uuid;
begin
  select id, application_id
    into v_staff_id, v_application_id
  from public.recruitment_staff
  where bimed_id = 'BH-001031'
  limit 1;

  if v_staff_id is not null then
    update public.recruitment_staff
       set address_line_1 = 'Block 150, Area B, Nyanya, FCT, Abuja, Nigeria',
           country = 'Nigeria',
           updated_at = now()
     where id = v_staff_id;
  end if;

  if v_application_id is not null then
    update public.recruitment_applications
       set address = 'Block 150, Area B, Nyanya, FCT, Abuja, Nigeria',
           country_of_residence = 'Nigeria',
           current_country = 'Nigeria',
           updated_at = now()
     where id = v_application_id;
  end if;
end
$$;
