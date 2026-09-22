-- Correct BH-001029 staff-facing residential profile to the candidate's stated current residence.
-- The application already recorded Zambia. No street address is invented here.

update public.recruitment_staff
set address_line_1 = 'Lusaka',
    address_line_2 = null,
    city = null,
    country = 'Zambia',
    portal_address = 'Lusaka, Zambia',
    updated_at = now()
where bimed_id = 'BH-001029';

update public.recruitment_applications
set address = 'Lusaka, Zambia',
    country_of_residence = 'Zambia',
    current_country = 'Zambia',
    updated_at = now()
where id = (
  select application_id
  from public.recruitment_staff
  where bimed_id = 'BH-001029'
  limit 1
);