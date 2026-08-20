-- Verifies that supabase/migrations/20260820_production_hardening.sql has been
-- applied correctly. Read-only: it creates, alters and deletes nothing.
--
-- Run it in the Supabase SQL editor (or any psql session) against the project
-- after applying the migration. Every row must report PASS.

with expected_tables(table_name) as (
  values ('recruitment_invites'), ('recruitment_applications'), ('recruitment_audit_log'),
         ('recruitment_admin_users'), ('recruitment_rate_limits'),
         ('recruitment_admin_password_resets'), ('recruitment_interviews'),
         ('recruitment_email_log')
),
rpcs(label, signature) as (
  values ('create_recruitment_application', 'public.create_recruitment_application(text,jsonb)'),
         ('check_recruitment_rate_limit',   'public.check_recruitment_rate_limit(text,integer,integer)'),
         ('purge_recruitment_data',         'public.purge_recruitment_data()')
),
results(sort_key, check_name, status, detail) as (

  -- A. Revocable admin sessions
  select 1, 'A. recruitment_admin_users.session_version',
    case when count(*) = 1 then 'PASS' else 'FAIL' end,
    coalesce(min(data_type || ', default ' || coalesce(column_default, 'none')), 'column is missing')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'recruitment_admin_users'
    and column_name = 'session_version'

  -- B/C/D. Required RPCs exist
  union all
  select 2, 'B-D. RPC exists: ' || label,
    case when to_regprocedure(signature) is not null then 'PASS' else 'FAIL' end,
    coalesce(to_regprocedure(signature)::text, 'function is missing')
  from rpcs

  -- E. RLS enabled on every recruitment table
  union all
  select 3, 'E. RLS enabled: ' || e.table_name,
    case when c.relrowsecurity then 'PASS' else 'FAIL' end,
    case
      when c.oid is null then 'table is missing'
      when c.relrowsecurity then 'row level security enabled'
      else 'ROW LEVEL SECURITY IS DISABLED'
    end
  from expected_tables e
  left join pg_class c
    on c.relname = e.table_name
   and c.relnamespace = 'public'::regnamespace

  -- F1. anon / authenticated / PUBLIC must NOT be able to execute the RPCs
  union all
  select 4, 'F. ' || r.label || ' not executable by ' || g.grantee,
    case
      when to_regprocedure(r.signature) is null then 'FAIL'
      when has_function_privilege(g.grantee, to_regprocedure(r.signature), 'EXECUTE') then 'FAIL'
      else 'PASS'
    end,
    case
      when to_regprocedure(r.signature) is null then 'function is missing'
      when has_function_privilege(g.grantee, to_regprocedure(r.signature), 'EXECUTE')
        then 'EXECUTE IS GRANTED -- revoke it'
      else 'execute correctly revoked'
    end
  from rpcs r
  cross join (values ('anon'), ('authenticated'), ('public')) g(grantee)

  -- F2. service_role must be able to execute the RPCs
  union all
  select 5, 'F. ' || r.label || ' executable by service_role',
    case
      when to_regprocedure(r.signature) is null then 'FAIL'
      when has_function_privilege('service_role', to_regprocedure(r.signature), 'EXECUTE') then 'PASS'
      else 'FAIL'
    end,
    case
      when to_regprocedure(r.signature) is null then 'function is missing'
      when has_function_privilege('service_role', to_regprocedure(r.signature), 'EXECUTE')
        then 'service_role can execute'
      else 'SERVICE ROLE CANNOT EXECUTE -- the application will break'
    end
  from rpcs r
)
select check_name, status, detail
from results
order by sort_key, check_name;
