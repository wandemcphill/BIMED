-- BIMED Recruitment Portal production hardening.
-- Run after supabase/schema.sql before deploying the hardened application.

alter table recruitment_admin_users
  add column if not exists session_version integer not null default 1;

-- ---------------------------------------------------------------------------
-- Atomic invitation consumption + application creation
-- ---------------------------------------------------------------------------
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
    international_experience, relocation_readiness, supporting_documents, consent, status, updated_at
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
    'Submitted', now()
  ) returning * into application_row;

  update recruitment_invites
  set used_at = now()
  where id = invite_row.id and used_at is null;

  return application_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS defense-in-depth
-- ---------------------------------------------------------------------------
-- The application uses the Supabase service role server-side, which bypasses RLS.
-- These tables must not be readable/writable by anon/authenticated roles.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recruitment_invites', 'recruitment_applications', 'recruitment_audit_log',
    'recruitment_admin_users', 'recruitment_rate_limits', 'recruitment_admin_password_resets',
    'recruitment_interviews', 'recruitment_email_log'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('revoke all on table %I from anon, authenticated', table_name);
  end loop;
end $$;

revoke all on function create_recruitment_application(text, jsonb) from public, anon, authenticated;
grant execute on function create_recruitment_application(text, jsonb) to service_role;
revoke all on function check_recruitment_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function check_recruitment_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Retention purge
-- ---------------------------------------------------------------------------
-- Default policy: closed recruitment applications after 24 months; old invitations,
-- reset tokens, delivery logs and rate-limit buckets are retained only as needed for
-- operational/security purposes. Bimed should approve these periods before launch.
create or replace function purge_recruitment_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_application_count integer := 0;
  deleted_invite_count integer := 0;
  deleted_email_count integer := 0;
  deleted_reset_count integer := 0;
  deleted_rate_count integer := 0;
begin
  -- Remove audit records first so application/invite deletion remains FK-safe.
  delete from recruitment_audit_log
  where application_id in (
    select id from recruitment_applications
    where status in ('Rejected', 'Withdrawn')
      and coalesce(updated_at, submitted_at, now()) < now() - interval '24 months'
  )
  or invite_id in (
    select i.id
    from recruitment_invites i
    where (
      (i.used_at is not null and i.used_at < now() - interval '90 days')
      or (i.used_at is null and i.expires_at is not null and i.expires_at < now() - interval '90 days')
    )
    and not exists (
      select 1
      from recruitment_applications a
      where a.invite_id = i.id
    )
  );

  delete from recruitment_applications
  where status in ('Rejected', 'Withdrawn')
    and coalesce(updated_at, submitted_at, now()) < now() - interval '24 months';
  get diagnostics deleted_application_count = row_count;

  -- Never delete an invitation that is still referenced by a surviving application.
  delete from recruitment_invites i
  where (
    (i.used_at is not null and i.used_at < now() - interval '90 days')
    or (i.used_at is null and i.expires_at is not null and i.expires_at < now() - interval '90 days')
  )
  and not exists (
    select 1
    from recruitment_applications a
    where a.invite_id = i.id
  );
  get diagnostics deleted_invite_count = row_count;

  delete from recruitment_email_log
  where created_at < now() - interval '12 months';
  get diagnostics deleted_email_count = row_count;

  delete from recruitment_admin_password_resets
  where (used_at is not null and used_at < now() - interval '2 days')
     or (used_at is null and expires_at < now() - interval '2 days');
  get diagnostics deleted_reset_count = row_count;

  delete from recruitment_rate_limits
  where updated_at < now() - interval '7 days';
  get diagnostics deleted_rate_count = row_count;

  return jsonb_build_object(
    'deleted_applications', deleted_application_count,
    'deleted_invites', deleted_invite_count,
    'deleted_email_logs', deleted_email_count,
    'deleted_password_resets', deleted_reset_count,
    'deleted_rate_limits', deleted_rate_count,
    'ran_at', now()
  );
end;
$$;

revoke all on function purge_recruitment_data() from public, anon, authenticated;
grant execute on function purge_recruitment_data() to service_role;
