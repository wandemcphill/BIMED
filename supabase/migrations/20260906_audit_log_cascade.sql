-- Deleting a candidate's application currently fails with a foreign key violation whenever an
-- audit log entry references it (which is true of almost every application, since submission
-- itself logs an event) - recruitment_audit_log.application_id was created with no ON DELETE
-- clause, which defaults to NO ACTION. This finds whatever that constraint is actually named
-- (never explicitly named in schema.sql) and replaces it with ON DELETE SET NULL, so the audit
-- trail survives a deletion (an admin still sees "an application was deleted") without blocking it.
do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  where tc.table_name = 'recruitment_audit_log'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'application_id'
  limit 1;

  if fk_name is not null then
    execute format('alter table recruitment_audit_log drop constraint %I', fk_name);
  end if;

  alter table recruitment_audit_log
    add constraint recruitment_audit_log_application_id_fkey
    foreign key (application_id) references recruitment_applications(id) on delete set null;
end $$;
