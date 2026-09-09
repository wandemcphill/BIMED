-- BIMED internal workforce identity + portal messaging.
-- Internal addresses are UI/application identities only, never internet mailboxes.
create extension if not exists pgcrypto;

alter table recruitment_staff
  add column if not exists department_namespace text,
  add column if not exists portal_handle text,
  add column if not exists portal_address text;
create unique index if not exists recruitment_staff_portal_handle_idx on recruitment_staff(lower(portal_handle)) where portal_handle is not null;
create unique index if not exists recruitment_staff_portal_address_idx on recruitment_staff(lower(portal_address)) where portal_address is not null;

create table if not exists recruitment_staff_mailboxes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references recruitment_staff(id) on delete cascade,
  handle text not null,
  namespace text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists recruitment_staff_mailboxes_address_idx on recruitment_staff_mailboxes(lower(handle || '@' || namespace));
create index if not exists recruitment_staff_mailboxes_namespace_idx on recruitment_staff_mailboxes(namespace, lower(handle));

create table if not exists recruitment_staff_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text unique not null,
  created_by_staff_id uuid references recruitment_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index if not exists recruitment_staff_conversations_last_message_idx on recruitment_staff_conversations(last_message_at desc);

create table if not exists recruitment_staff_conversation_participants (
  conversation_id uuid not null references recruitment_staff_conversations(id) on delete cascade,
  staff_id uuid not null references recruitment_staff(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, staff_id)
);
create index if not exists recruitment_staff_conversation_participants_staff_idx on recruitment_staff_conversation_participants(staff_id, joined_at desc);

create table if not exists recruitment_staff_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references recruitment_staff_conversations(id) on delete cascade,
  sender_staff_id uuid references recruitment_staff(id) on delete restrict,
  sender_admin_email text,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  attachment_name text,
  attachment_path text,
  attachment_mime text,
  attachment_size bigint,
  check ((sender_staff_id is not null) or (sender_admin_email is not null))
);
create index if not exists recruitment_staff_messages_conversation_idx on recruitment_staff_messages(conversation_id, created_at asc);
create index if not exists recruitment_staff_messages_sender_idx on recruitment_staff_messages(sender_staff_id, created_at desc);

alter table recruitment_staff_mailboxes enable row level security;
alter table recruitment_staff_conversations enable row level security;
alter table recruitment_staff_conversation_participants enable row level security;
alter table recruitment_staff_messages enable row level security;
revoke all on recruitment_staff_mailboxes, recruitment_staff_conversations, recruitment_staff_conversation_participants, recruitment_staff_messages from anon, authenticated;
