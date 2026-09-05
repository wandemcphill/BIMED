-- Lets admins edit contract/job-description/handbook wording from the dashboard instead of
-- requiring a code change and redeploy. A row here overrides the matching fields of the
-- hardcoded template in lib/contract-templates.ts / lib/document-templates.ts; absent fields
-- fall back to the code defaults.

create table if not exists recruitment_document_overrides (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('contract', 'job_description', 'handbook')),
  role_slug text not null default '',
  content jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (doc_type, role_slug)
);

-- RLS defense-in-depth, matching the pattern in 20260820_production_hardening.sql: the
-- application talks to this table only via the Supabase service role, which bypasses RLS.
alter table recruitment_document_overrides enable row level security;
revoke all on table recruitment_document_overrides from anon, authenticated;
