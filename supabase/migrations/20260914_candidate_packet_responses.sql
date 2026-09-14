alter table if exists recruitment_document_packet_access
  add column if not exists response_data jsonb not null default '{}'::jsonb,
  add column if not exists last_saved_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column recruitment_document_packet_access.response_data is
  'Candidate-entered responses for interactive packet forms.';
comment on column recruitment_document_packet_access.last_saved_at is
  'Timestamp of the most recent candidate save for this packet.';
comment on column recruitment_document_packet_access.completed_at is
  'Timestamp when the candidate submitted the packet as complete.';
