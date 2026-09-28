create table if not exists public.recruitment_contract_document_access (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  application_id uuid not null references public.recruitment_applications(id) on delete cascade,
  signature_id uuid null references public.recruitment_contract_signatures(id) on delete set null,
  access_kind text not null check (access_kind in ('signed','unsigned')),
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.recruitment_contract_document_access enable row level security;
revoke all on table public.recruitment_contract_document_access from anon, authenticated;
grant all on table public.recruitment_contract_document_access to service_role;
