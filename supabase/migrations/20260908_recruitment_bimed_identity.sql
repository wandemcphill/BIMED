-- Surface the permanent BIMED staff identity on the recruitment record as well.
-- This makes the BIMED ID visible across both lifecycle stages without creating a second identity.

alter table if exists recruitment_applications
  add column if not exists bimed_id text;

create index if not exists recruitment_applications_bimed_id_idx
  on recruitment_applications(bimed_id)
  where bimed_id is not null;
