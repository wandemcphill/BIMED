-- BIMED candidate packet delivery records.
-- Private server-side access records for candidate-specific document links.

create table if not exists recruitment_document_packet_access (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  packet_slug text not null,
  token_hash text unique not null,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_document_packet_access_application_idx
  on recruitment_document_packet_access(application_id, issued_at desc);
create index if not exists recruitment_document_packet_access_expiry_idx
  on recruitment_document_packet_access(expires_at);

alter table recruitment_document_packet_access enable row level security;
revoke all on table recruitment_document_packet_access from anon, authenticated;

comment on table recruitment_document_packet_access is 'Server-issued, expiring candidate access records for BIMED recruitment packet documents.';
