-- Enable Supabase/Postgres cron for time-based recruitment workflow enforcement.
create extension if not exists pg_cron with schema pg_catalog;
