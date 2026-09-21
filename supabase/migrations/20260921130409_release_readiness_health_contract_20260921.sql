create or replace function public.bimed_release_readiness_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with required_tables(name) as (
    values
      ('recruitment_applications'),
      ('recruitment_interviews'),
      ('recruitment_second_interviews'),
      ('recruitment_shift_requests'),
      ('recruitment_workforce_shifts'),
      ('recruitment_staff_onboarding_packages'),
      ('recruitment_staff_onboarding_tasks')
  ),
  required_functions(signature) as (
    values
      ('public.bimed_create_second_interview_invitation(uuid,text,text,timestamptz)'::text),
      ('public.bimed_schedule_recruitment_interview(uuid,timestamptz,integer,text,text,text,text,text)'::text),
      ('public.bimed_transition_application_status(uuid,text,text,text)'::text),
      ('public.bimed_promote_application_to_staff(uuid,text)'::text),
      ('public.bimed_request_staff_leave(uuid,text,date,date,text,text)'::text)
  ),
  missing_tables as (
    select coalesce(array_agg(name order by name), '{}'::text[]) as names
    from required_tables
    where to_regclass(format('public.%I', name)) is null
  ),
  missing_functions as (
    select coalesce(array_agg(signature order by signature), '{}'::text[]) as signatures
    from required_functions
    where to_regprocedure(signature) is null
  ),
  relation_ok as (
    select
      exists (
        select 1
        from pg_constraint c
        join pg_class child on child.oid = c.conrelid
        join pg_class parent on parent.oid = c.confrelid
        join pg_namespace ns on ns.oid = child.relnamespace
        where ns.nspname = 'public'
          and child.relname = 'recruitment_shift_requests'
          and parent.relname = 'recruitment_workforce_shifts'
          and c.conname = 'recruitment_shift_requests_shift_id_fkey'
      ) as shift_fk_ok,
      exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'recruitment_staff_onboarding_tasks'
          and indexname = 'recruitment_staff_onboarding_tasks_acknowledged_by_idx'
      ) as onboarding_ack_index_ok
  ),
  migration_state as (
    select
      count(*)::integer as applied_migrations,
      max(version) as latest_migration
    from supabase_migrations.schema_migrations
  )
  select jsonb_build_object(
    'ok',
      cardinality((select names from missing_tables)) = 0
      and cardinality((select signatures from missing_functions)) = 0
      and (select shift_fk_ok from relation_ok)
      and (select onboarding_ack_index_ok from relation_ok),
    'missing_tables', (select to_jsonb(names) from missing_tables),
    'missing_functions', (select to_jsonb(signatures) from missing_functions),
    'shift_fk_ok', (select shift_fk_ok from relation_ok),
    'onboarding_ack_index_ok', (select onboarding_ack_index_ok from relation_ok),
    'applied_migrations', (select applied_migrations from migration_state),
    'latest_migration', (select latest_migration from migration_state)
  );
$$;

revoke all on function public.bimed_release_readiness_check() from public, anon, authenticated;
grant execute on function public.bimed_release_readiness_check() to service_role;
