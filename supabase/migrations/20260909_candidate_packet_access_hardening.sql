-- Harden candidate packet access records to match the application contract.
-- Safe for databases that already received the original delivery migration.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='recruitment_document_packet_access' and column_name='issued_by'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='recruitment_document_packet_access' and column_name='created_by'
  ) then
    alter table public.recruitment_document_packet_access rename column issued_by to created_by;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='recruitment_document_packet_access' and column_name='created_by'
  ) then
    alter table public.recruitment_document_packet_access add column created_by text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='recruitment_document_packet_access' and column_name='revoked_at'
  ) then
    alter table public.recruitment_document_packet_access add column revoked_at timestamptz;
  end if;
end $$;

alter table public.recruitment_document_packet_access alter column created_by set default 'system';
create index if not exists recruitment_document_packet_access_active_hardened_idx
  on public.recruitment_document_packet_access(application_id, packet_slug, issued_at desc)
  where revoked_at is null;
alter table public.recruitment_document_packet_access enable row level security;
revoke all on table public.recruitment_document_packet_access from anon, authenticated;
