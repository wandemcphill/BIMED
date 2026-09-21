-- Fixes check_recruitment_rate_limit, which raised
--   42702: column reference "bucket_key" is ambiguous
-- on every call, because its first parameter was named `bucket_key` and so is the
-- column it inserts into. PostgreSQL cannot tell the parameter from the column in
-- `on conflict (bucket_key)`, so the function failed for every caller.
--
-- lib/rate-limit.ts fails closed on error, so a failing limiter denied every request:
-- admin login, invitation creation and candidate submission all returned HTTP 429.
--
-- The parameters are renamed with the p_ prefix already used by
-- create_recruitment_application(p_token_hash, p_payload). Callers pass these by name
-- through PostgREST, so lib/rate-limit.ts is updated to match.
--
-- CREATE OR REPLACE cannot rename input parameters, so the function is dropped first.
-- Dropping clears its grants, which are therefore re-applied below.

drop function if exists check_recruitment_rate_limit(text, integer, integer);

create or replace function check_recruitment_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  current_window_start timestamptz;
  current_count integer;
  window_interval interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  insert into recruitment_rate_limits (bucket_key, window_start, request_count, updated_at)
  values (p_bucket_key, now_ts, 1, now_ts)
  on conflict (bucket_key) do update
  set request_count = case
    when recruitment_rate_limits.window_start < now_ts - window_interval then 1
    else recruitment_rate_limits.request_count + 1
  end,
  window_start = case
    when recruitment_rate_limits.window_start < now_ts - window_interval then now_ts
    else recruitment_rate_limits.window_start
  end,
  updated_at = now_ts
  returning window_start, request_count
  into current_window_start, current_count;

  allowed := current_count <= greatest(p_max_requests, 1);
  remaining := greatest(greatest(p_max_requests, 1) - current_count, 0);

  if allowed then
    retry_after_seconds := null;
  else
    retry_after_seconds := greatest(
      ceil(extract(epoch from (current_window_start + window_interval - now_ts)))::integer,
      1
    );
  end if;

  return next;
end;
$$;

revoke all on function check_recruitment_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function check_recruitment_rate_limit(text, integer, integer) to service_role;
