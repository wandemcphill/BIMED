-- Adds the written first interview (completed as part of the application, stored on the
-- application row) and the practical second interview (invite-only, its own table).

alter table recruitment_applications
  add column if not exists interview_responses jsonb;

-- Recreates create_recruitment_application (from 20260820_production_hardening.sql) to also
-- write interview_responses inside the same atomic transaction as the application insert and
-- invite consumption - keeping the all-or-nothing guarantee that fixed the earlier lost-submission
-- bug (see 20260820_production_hardening.sql / PRODUCTION_HARDENING.md).
create or replace function create_recruitment_application(p_token_hash text, p_payload jsonb)
returns recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row recruitment_invites;
  application_row recruitment_applications;
begin
  select * into invite_row
  from recruitment_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_FOUND';
  end if;

  if invite_row.used_at is not null then
    raise exception using errcode = 'P0001', message = 'INVITATION_USED';
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_EXPIRED';
  end if;

  insert into recruitment_applications (
    invite_id, full_name, preferred_name, email, phone, date_of_birth, nationality,
    country_of_residence, address, role_applied, employment_type, availability, start_date,
    driving_licence, vehicle_access, care_experience, qualifications, training,
    professional_experience, employment_history, employment_gaps, professional_references,
    living_in_ireland, current_country, work_permission, requires_employment_permit,
    international_experience, relocation_readiness, supporting_documents, consent, status,
    interview_responses, updated_at
  ) values (
    invite_row.id,
    p_payload->>'full_name', p_payload->>'preferred_name', p_payload->>'email', p_payload->>'phone',
    nullif(p_payload->>'date_of_birth', '')::date, p_payload->>'nationality',
    p_payload->>'country_of_residence', p_payload->>'address', p_payload->>'role_applied',
    p_payload->>'employment_type', p_payload->>'availability', nullif(p_payload->>'start_date', '')::date,
    p_payload->>'driving_licence', p_payload->>'vehicle_access', p_payload->>'care_experience',
    p_payload->>'qualifications', p_payload->>'training', p_payload->>'professional_experience',
    p_payload->>'employment_history', p_payload->>'employment_gaps', p_payload->>'references',
    p_payload->>'living_in_ireland', p_payload->>'current_country', p_payload->>'work_permission',
    p_payload->>'requires_employment_permit', p_payload->>'international_experience',
    p_payload->>'relocation_readiness', coalesce(p_payload->'supporting_documents', '[]'::jsonb), true,
    'Submitted', coalesce(p_payload->'interview_responses', '{}'::jsonb), now()
  ) returning * into application_row;

  update recruitment_invites
  set used_at = now()
  where id = invite_row.id and used_at is null;

  return application_row;
end;
$$;

revoke all on function create_recruitment_application(text, jsonb) from public, anon, authenticated;
grant execute on function create_recruitment_application(text, jsonb) to service_role;

-- Second (practical) interview: invite-only, sent after the written interview and application
-- review, for candidates Bimed is seriously considering.
create table if not exists recruitment_second_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'sent' check (status in ('sent', 'completed')),
  answers jsonb,
  sent_by text not null,
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_second_interviews_application_id_idx
  on recruitment_second_interviews(application_id);

alter table recruitment_second_interviews enable row level security;
revoke all on table recruitment_second_interviews from anon, authenticated;

-- Private bucket for written-interview voice notes. Only ever accessed with the service-role
-- client (upload on submission, signed URLs for admin playback) - no anon/authenticated policies
-- are added, so it is unreachable by anyone but the server, consistent with every other table here.
insert into storage.buckets (id, name, public)
values ('interview-recordings', 'interview-recordings', false)
on conflict (id) do nothing;
