-- ---------------------------------------------------------------------------
-- BIMED internal workforce messaging hardening
-- ---------------------------------------------------------------------------
-- Messages are an append-only workplace record. Admin read state is kept on
-- the shared BIMED admin side of each conversation because admins are not
-- represented as staff participants.

alter table recruitment_staff_conversations
  add column if not exists admin_last_read_at timestamptz,
  add column if not exists admin_last_read_by text;

create index if not exists recruitment_staff_conversations_admin_unread_idx
  on recruitment_staff_conversations(admin_last_read_at, last_message_at desc);

create or replace function prevent_bimed_message_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'BIMED messages are append-only and cannot be edited or deleted';
end;
$$;

drop trigger if exists recruitment_staff_messages_immutable on recruitment_staff_messages;
create trigger recruitment_staff_messages_immutable
before update or delete on recruitment_staff_messages
for each row execute function prevent_bimed_message_mutation();

comment on column recruitment_staff_conversations.admin_last_read_at is
  'Last time the shared BIMED admin side of this conversation was opened.';
comment on column recruitment_staff_conversations.admin_last_read_by is
  'Admin email that last opened this conversation.';
comment on table recruitment_staff_messages is
  'Append-only internal workforce communication record. File attachments are not part of the supported messaging product.';
