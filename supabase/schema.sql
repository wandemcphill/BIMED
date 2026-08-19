create extension if not exists pgcrypto;

create table if not exists recruitment_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  candidate_email text not null,
  candidate_name text,
  role text,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references recruitment_invites(id),
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  date_of_birth date,
  nationality text,
  country_of_residence text,
  address text,
  role_applied text,
  employment_type text,
  availability text,
  start_date date,
  driving_licence text,
  vehicle_access text,
  care_experience text,
  qualifications text,
  training text,
  professional_experience text,
  employment_history text,
  employment_gaps text,
  professional_references text,
  living_in_ireland text,
  current_country text,
  work_permission text,
  requires_employment_permit text,
  international_experience text,
  relocation_readiness text,
  supporting_documents jsonb default '[]',
  consent boolean not null default false,
  status text not null default 'Submitted',
  admin_notes text,
  submitted_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists recruitment_audit_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references recruitment_applications(id),
  invite_id uuid references recruitment_invites(id),
  event_type text not null,
  actor text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists recruitment_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  role text not null default 'admin',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table if exists recruitment_applications add column if not exists professional_experience text;
alter table if exists recruitment_applications add column if not exists living_in_ireland text;
alter table if exists recruitment_applications add column if not exists current_country text;
alter table if exists recruitment_applications add column if not exists requires_employment_permit text;
alter table if exists recruitment_applications add column if not exists relocation_readiness text;
alter table if exists recruitment_applications add column if not exists professional_references text;
alter table if exists recruitment_applications add column if not exists admin_notes text;
alter table if exists recruitment_applications add column if not exists updated_at timestamptz default now();

create index if not exists applications_submitted_idx on recruitment_applications(submitted_at desc);
create index if not exists recruitment_audit_log_application_idx on recruitment_audit_log(application_id, created_at desc);
create index if not exists recruitment_audit_log_invite_idx on recruitment_audit_log(invite_id, created_at desc);
create index if not exists recruitment_admin_users_email_idx on recruitment_admin_users(email);
create index if not exists recruitment_rate_limits_updated_idx on recruitment_rate_limits(updated_at desc);

create or replace function check_recruitment_rate_limit(
  bucket_key text,
  max_requests integer,
  window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  current_window_start timestamptz;
  current_count integer;
  window_interval interval := make_interval(secs => greatest(window_seconds, 1));
begin
  insert into recruitment_rate_limits (bucket_key, window_start, request_count, updated_at)
  values (bucket_key, now_ts, 1, now_ts)
  on conflict (bucket_key) do update
  set request_count = case
    when recruitment_rate_limits.window_start < now_ts - window_interval then 1
    else recruitment_rate_limits.request_count + 1
  end,
  window_start = case
    when recruitment_rate_limits.window_start < now_ts - window_interval then now_ts
    else recruitment_rate_limits.window_start
  end,
  updated_at = now_ts
  returning window_start, request_count
  into current_window_start, current_count;

  allowed := current_count <= greatest(max_requests, 1);
  remaining := greatest(greatest(max_requests, 1) - current_count, 0);

  if allowed then
    retry_after_seconds := null;
  else
    retry_after_seconds := greatest(
      ceil(extract(epoch from (current_window_start + window_interval - now_ts)))::integer,
      1
    );
  end if;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactional email support (Resend)
-- ---------------------------------------------------------------------------

-- Single-use, short-lived password reset tokens for admin accounts.
-- Only the SHA-256 hash of the token is stored, mirroring recruitment_invites.
create table if not exists recruitment_admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references recruitment_admin_users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_admin_password_resets_user_idx
  on recruitment_admin_password_resets(admin_user_id, created_at desc);
create index if not exists recruitment_admin_password_resets_expiry_idx
  on recruitment_admin_password_resets(expires_at);

-- Interview scheduling for the existing "Interview" application status.
-- One row per interview; rescheduling updates the row and bumps reschedule_count.
create table if not exists recruitment_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer,
  location text,
  meeting_link text,
  interviewer text,
  candidate_instructions text,
  status text not null default 'Scheduled',
  reschedule_count integer not null default 0,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_interviews_application_idx
  on recruitment_interviews(application_id, scheduled_at desc);

-- Delivery log used both for observability and for duplicate-send protection.
-- dedupe_key is unique: a repeated request claiming the same key does not resend.
create table if not exists recruitment_email_log (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text unique not null,
  email_type text not null,
  application_id uuid references recruitment_applications(id) on delete set null,
  recipient_hint text,
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_email_log_type_idx on recruitment_email_log(email_type, created_at desc);
create index if not exists recruitment_email_log_application_idx on recruitment_email_log(application_id, created_at desc);
create index if not exists recruitment_email_log_status_idx on recruitment_email_log(status, created_at desc);
