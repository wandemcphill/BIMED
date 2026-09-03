-- Verifies that supabase/migrations/20260903_contract_esignature.sql has been applied
-- correctly. Read-only: it creates, alters and deletes nothing.
--
-- Run it in the Supabase SQL editor (or any psql session) after applying the migration.
-- Every row must report PASS.

with results(sort_key, check_name, status, detail) as (

  select 1, 'A. recruitment_contract_signatures table exists',
    case when count(*) = 1 then 'PASS' else 'FAIL' end,
    coalesce(min('table present'), 'table is missing')
  from information_schema.tables
  where table_schema = 'public' and table_name = 'recruitment_contract_signatures'

  union all
  select 2, 'B. token_hash is unique',
    case when count(*) = 1 then 'PASS' else 'FAIL' end,
    coalesce(min(constraint_type), 'unique constraint on token_hash is missing')
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
  where tc.table_schema = 'public' and tc.table_name = 'recruitment_contract_signatures'
    and tc.constraint_type = 'UNIQUE' and ccu.column_name = 'token_hash'

  union all
  select 3, 'C. RLS enabled on recruitment_contract_signatures',
    case when c.relrowsecurity then 'PASS' else 'FAIL' end,
    case when c.oid is null then 'table is missing' when c.relrowsecurity then 'row level security enabled' else 'ROW LEVEL SECURITY IS DISABLED' end
  from pg_class c
  where c.relname = 'recruitment_contract_signatures' and c.relnamespace = 'public'::regnamespace

  union all
  select 4, 'D. recruitment_contract_signatures not readable by ' || g.grantee,
    case when has_table_privilege(g.grantee, 'public.recruitment_contract_signatures', 'SELECT') then 'FAIL' else 'PASS' end,
    case when has_table_privilege(g.grantee, 'public.recruitment_contract_signatures', 'SELECT') then 'SELECT IS GRANTED -- revoke it' else 'select correctly revoked' end
  from (values ('anon'), ('authenticated')) g(grantee)
)
select check_name, status, detail
from results
order by sort_key, check_name;
