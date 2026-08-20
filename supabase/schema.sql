create extension if not exists pgcrypto;

create table if not exists recruitment_invites (
  id uuid primary key default gen_random_uuid(), token_hash text unique not null, candidate_email text not null,
  candidate_name text, role text, expires_at timestamptz, used_at timestamptz, created_at timestamptz default now()
);
create table if not exists recruitment_applications (
  id uuid primary key default gen_random_uuid(), invite_id uuid references recruitment_invites(id), full_name text not null,
  preferred_name text, email text not null, phone text, date_of_birth date, nationality text, country_of_residence text,
  address text, role_applied text, employment_type text, availability text, start_date date, driving_licence text,
  vehicle_access text, care_experience text, qualifications text, training text, professional_experience text,
  employment_history text, employment_gaps text, professional_references text, living_in_ireland text, current_country text,
  work_permission text, requires_employment_permit text, international_experience text, relocation_readiness text,
  supporting_documents jsonb default '[]', consent boolean not null default false, status text not null default 'Submitted',
  admin_notes text, submitted_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists recruitment_audit_log (
  id uuid primary key default gen_random_uuid(), application_id uuid references recruitment_applications(id) on delete set null,
  invite_id uuid references recruitment_invites(id) on delete set null, event_type text not null, actor text not null,
  metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists recruitment_admin_users (
  id uuid primary key default gen_random_uuid(), email text not null unique, password_hash text not null,
  display_name text, role text not null default 'admin', active boolean not null default true,
  last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists recruitment_admin_sessions (
  id uuid primary key, admin_user_id uuid not null references recruitment_admin_users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, revoked_at timestamptz,
  last_seen_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists recruitment_rate_limits (
  bucket_key text primary key, window_start timestamptz not null, request_count integer not null default 0, updated_at timestamptz not null default now()
);

create or replace function check_recruitment_rate_limit(bucket_key text, max_requests integer, window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = public as $$
declare now_ts timestamptz := now(); current_window_start timestamptz; current_count integer;
window_interval interval := make_interval(secs => greatest(window_seconds, 1));
begin
  insert into recruitment_rate_limits (bucket_key, window_start, request_count, updated_at) values (bucket_key, now_ts, 1, now_ts)
  on conflict (bucket_key) do update
  set request_count = case when recruitment_rate_limits.window_start < now_ts - window_interval then 1 else recruitment_rate_limits.request_count + 1 end,
      window_start = case when recruitment_rate_limits.window_start < now_ts - window_interval then now_ts else recruitment_rate_limits.window_start end,
      updated_at = now_ts
  returning window_start, request_count into current_window_start, current_count;
  allowed := current_count <= greatest(max_requests, 1); remaining := greatest(greatest(max_requests, 1) - current_count, 0);
  retry_after_seconds := case when allowed then null else greatest(ceil(extract(epoch from (current_window_start + window_interval - now_ts)))::integer, 1) end;
  return next;
end; $$;

create table if not exists recruitment_admin_password_resets (
  id uuid primary key default gen_random_uuid(), admin_user_id uuid not null references recruitment_admin_users(id) on delete cascade,
  token_hash text unique not null, expires_at timestamptz not null, used_at timestamptz, requested_ip text, created_at timestamptz not null default now()
);
create table if not exists recruitment_interviews (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references recruitment_applications(id) on delete cascade,
  scheduled_at timestamptz not null, duration_minutes integer, location text, meeting_link text, interviewer text,
  candidate_instructions text, status text not null default 'Scheduled', reschedule_count integer not null default 0,
  cancelled_at timestamptz, cancellation_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists recruitment_email_log (
  id uuid primary key default gen_random_uuid(), dedupe_key text unique not null, email_type text not null,
  application_id uuid references recruitment_applications(id) on delete set null, recipient_hint text,
  status text not null default 'pending', provider_message_id text, error_message text, attempts integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table if exists recruitment_applications add column if not exists professional_experience text;
alter table if exists recruitment_applications add column if not exists living_in_ireland text;
alter table if exists recruitment_applications add column if not exists current_country text;
alter table if exists recruitment_applications add column if not exists requires_employment_permit text;
alter table if exists recruitment_applications add column if not exists relocation_readiness text;
alter table if exists recruitment_applications add column if not exists professional_references text;
alter table if exists recruitment_applications add column if not exists admin_notes text;
alter table if exists recruitment_applications add column if not exists updated_at timestamptz default now();

alter table if exists recruitment_audit_log drop constraint if exists recruitment_audit_log_application_id_fkey;
alter table if exists recruitment_audit_log drop constraint if exists recruitment_audit_log_invite_id_fkey;
alter table if exists recruitment_audit_log add constraint recruitment_audit_log_application_id_fkey foreign key (application_id) references recruitment_applications(id) on delete set null;
alter table if exists recruitment_audit_log add constraint recruitment_audit_log_invite_id_fkey foreign key (invite_id) references recruitment_invites(id) on delete set null;

create index if not exists applications_submitted_idx on recruitment_applications(submitted_at desc);
create index if not exists recruitment_audit_log_application_idx on recruitment_audit_log(application_id, created_at desc);
create index if not exists recruitment_audit_log_invite_idx on recruitment_audit_log(invite_id, created_at desc);
create index if not exists recruitment_admin_users_email_idx on recruitment_admin_users(email);
create index if not exists recruitment_admin_sessions_user_idx on recruitment_admin_sessions(admin_user_id, created_at desc);
create index if not exists recruitment_admin_sessions_expiry_idx on recruitment_admin_sessions(expires_at);
create index if not exists recruitment_rate_limits_updated_idx on recruitment_rate_limits(updated_at desc);
create index if not exists recruitment_admin_password_resets_user_idx on recruitment_admin_password_resets(admin_user_id, created_at desc);
create index if not exists recruitment_admin_password_resets_expiry_idx on recruitment_admin_password_resets(expires_at);
create index if not exists recruitment_interviews_application_idx on recruitment_interviews(application_id, scheduled_at desc);
create index if not exists recruitment_email_log_type_idx on recruitment_email_log(email_type, created_at desc);
create index if not exists recruitment_email_log_application_idx on recruitment_email_log(application_id, created_at desc);
create index if not exists recruitment_email_log_status_idx on recruitment_email_log(status, created_at desc);

alter table recruitment_invites enable row level security;
alter table recruitment_applications enable row level security;
alter table recruitment_audit_log enable row level security;
alter table recruitment_admin_users enable row level security;
alter table recruitment_admin_sessions enable row level security;
alter table recruitment_rate_limits enable row level security;
alter table recruitment_admin_password_resets enable row level security;
alter table recruitment_interviews enable row level security;
alter table recruitment_email_log enable row level security;

create or replace function consume_and_create_recruitment_application(p_token_hash text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare invite_row recruitment_invites%rowtype; application_id uuid;
begin
  select * into invite_row from recruitment_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001'; end if;
  if invite_row.used_at is not null then raise exception 'INVITE_ALREADY_USED' using errcode = 'P0002'; end if;
  if invite_row.expires_at is not null and invite_row.expires_at <= now() then raise exception 'INVITE_EXPIRED' using errcode = 'P0003'; end if;

  insert into recruitment_applications (
    invite_id, full_name, preferred_name, email, phone, date_of_birth, nationality, country_of_residence, address,
    role_applied, employment_type, availability, start_date, driving_licence, vehicle_access, care_experience,
    qualifications, training, professional_experience, employment_history, employment_gaps, professional_references,
    living_in_ireland, current_country, work_permission, requires_employment_permit, international_experience,
    relocation_readiness, supporting_documents, consent, status, updated_at
  ) values (
    invite_row.id, p_payload->>'full_name', p_payload->>'preferred_name', p_payload->>'email', p_payload->>'phone',
    nullif(p_payload->>'date_of_birth','')::date, p_payload->>'nationality', p_payload->>'country_of_residence', p_payload->>'address',
    p_payload->>'role_applied', p_payload->>'employment_type', p_payload->>'availability', nullif(p_payload->>'start_date','')::date,
    p_payload->>'driving_licence', p_payload->>'vehicle_access', p_payload->>'care_experience', p_payload->>'qualifications', p_payload->>'training',
    p_payload->>'professional_experience', p_payload->>'employment_history', p_payload->>'employment_gaps', p_payload->>'professional_references',
    p_payload->>'living_in_ireland', p_payload->>'current_country', p_payload->>'work_permission', p_payload->>'requires_employment_permit',
    p_payload->>'international_experience', p_payload->>'relocation_readiness', coalesce(p_payload->'supporting_documents','[]'::jsonb), true, 'Submitted', now()
  ) returning id into application_id;
  update recruitment_invites set used_at = now() where id = invite_row.id;
  return application_id;
end; $$;
revoke all on function consume_and_create_recruitment_application(text, jsonb) from public;
grant execute on function consume_and_create_recruitment_application(text, jsonb) to service_role;
revoke all on function check_recruitment_rate_limit(text, integer, integer) from public;
grant execute on function check_recruitment_rate_limit(text, integer, integer) to service_role;

create or replace function purge_recruitment_data(
  p_application_retention_days integer default 730, p_email_log_retention_days integer default 180,
  p_rate_limit_retention_days integer default 3, p_invite_retention_days integer default 90,
  p_password_reset_retention_days integer default 30
) returns jsonb language plpgsql security definer set search_path = public as $$
declare applications_deleted integer := 0; invites_deleted integer := 0; audit_deleted integer := 0;
interviews_deleted integer := 0; email_logs_deleted integer := 0; sessions_deleted integer := 0;
resets_deleted integer := 0; rate_limits_deleted integer := 0;
begin
  delete from recruitment_audit_log where created_at < now() - make_interval(days => greatest(p_application_retention_days, 1)); get diagnostics audit_deleted = row_count;
  delete from recruitment_interviews where updated_at < now() - make_interval(days => greatest(p_application_retention_days, 1)); get diagnostics interviews_deleted = row_count;
  delete from recruitment_applications where submitted_at < now() - make_interval(days => greatest(p_application_retention_days, 1)); get diagnostics applications_deleted = row_count;
  delete from recruitment_invites where (used_at is not null and used_at < now() - make_interval(days => greatest(p_invite_retention_days, 1))) or (used_at is null and expires_at is not null and expires_at < now() - make_interval(days => greatest(p_invite_retention_days, 1))); get diagnostics invites_deleted = row_count;
  delete from recruitment_email_log where created_at < now() - make_interval(days => greatest(p_email_log_retention_days, 1)); get diagnostics email_logs_deleted = row_count;
  delete from recruitment_admin_sessions where expires_at < now() or revoked_at < now() - interval '7 days'; get diagnostics sessions_deleted = row_count;
  delete from recruitment_admin_password_resets where expires_at < now() - make_interval(days => greatest(p_password_reset_retention_days, 1)); get diagnostics resets_deleted = row_count;
  delete from recruitment_rate_limits where updated_at < now() - make_interval(days => greatest(p_rate_limit_retention_days, 1)); get diagnostics rate_limits_deleted = row_count;
  return jsonb_build_object('applications_deleted', applications_deleted, 'invites_deleted', invites_deleted, 'audit_deleted', audit_deleted, 'interviews_deleted', interviews_deleted, 'email_logs_deleted', email_logs_deleted, 'sessions_deleted', sessions_deleted, 'password_resets_deleted', resets_deleted, 'rate_limits_deleted', rate_limits_deleted);
end; $$;
revoke all on function purge_recruitment_data(integer, integer, integer, integer, integer) from public;
grant execute on function purge_recruitment_data(integer, integer, integer, integer, integer) to service_role;
