-- Candidate/employee document packet access.
-- Tokens are short-lived, hashed at rest, and only grant access to a named application's packet.
create table if not exists recruitment_document_packet_access (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references recruitment_applications(id) on delete cascade,
  packet_slug text not null,
  token_hash text unique not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists recruitment_document_packet_access_application_idx
  on recruitment_document_packet_access(application_id, packet_slug, created_at desc);
create index if not exists recruitment_document_packet_access_expiry_idx
  on recruitment_document_packet_access(expires_at);
alter table recruitment_document_packet_access enable row level security;
revoke all on table recruitment_document_packet_access from anon, authenticated;
comment on table recruitment_document_packet_access is 'Private, expiring links for candidate-facing BIMED document packets.';
