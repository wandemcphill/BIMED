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

alter table if exists recruitment_applications add column if not exists professional_experience text;
alter table if exists recruitment_applications add column if not exists living_in_ireland text;
alter table if exists recruitment_applications add column if not exists current_country text;
alter table if exists recruitment_applications add column if not exists requires_employment_permit text;
alter table if exists recruitment_applications add column if not exists relocation_readiness text;
alter table if exists recruitment_applications add column if not exists professional_references text;
alter table if exists recruitment_applications add column if not exists admin_notes text;
alter table if exists recruitment_applications add column if not exists updated_at timestamptz default now();

create index if not exists applications_submitted_idx on recruitment_applications(submitted_at desc);
