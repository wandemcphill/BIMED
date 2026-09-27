create table if not exists public.recruitment_dete_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.recruitment_staff(id) on delete restrict,
  application_id uuid not null references public.recruitment_applications(id) on delete restrict,
  role_slug text not null,
  bimed_id text not null,
  employee_name text not null,
  employee_email text not null,
  status text not null default 'issued' check (status = any (array['issued','signed','revoked','expired']::text[])),
  token_hash text not null unique,
  document_snapshot jsonb not null,
  employer_signed_name text not null,
  employer_signed_at timestamptz not null default now(),
  employee_signed_name text,
  employee_signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recruitment_dete_contract_signatures enable row level security;
revoke all on table public.recruitment_dete_contract_signatures from anon, authenticated;

create unique index if not exists recruitment_dete_contract_signatures_one_issued_per_staff
  on public.recruitment_dete_contract_signatures (staff_id)
  where status = 'issued';

create index if not exists recruitment_dete_contract_signatures_staff_created
  on public.recruitment_dete_contract_signatures (staff_id, created_at desc);

create index if not exists recruitment_dete_contract_signatures_application_created
  on public.recruitment_dete_contract_signatures (application_id, created_at desc);
