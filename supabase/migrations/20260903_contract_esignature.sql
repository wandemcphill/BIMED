-- Adds e-signature support for issued employment contracts.
-- Run after supabase/migrations/20260820_production_hardening.sql.

create table if not exists recruitment_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  role_slug text not null,
  token_hash text not null unique,
  employee_name text not null,
  employee_address text,
  start_date date,
  status text not null default 'issued' check (status in ('issued', 'signed')),
  signed_name text,
  signed_at timestamptz,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_contract_signatures_application_id_idx
  on recruitment_contract_signatures(application_id);

-- RLS defense-in-depth, matching the pattern in 20260820_production_hardening.sql: the
-- application talks to this table only via the Supabase service role, which bypasses RLS.
alter table recruitment_contract_signatures enable row level security;
revoke all on table recruitment_contract_signatures from anon, authenticated;
