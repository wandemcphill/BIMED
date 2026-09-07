-- Protect the BIMED rota from overlapping assignments for the same employee.
-- Open/unassigned shifts are excluded, so many staff can request the same open shift.

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workforce_shift_no_overlap'
      and conrelid = 'recruitment_workforce_shifts'::regclass
  ) then
    alter table recruitment_workforce_shifts
      add constraint workforce_shift_no_overlap
      exclude using gist (
        staff_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (staff_id is not null and status in ('assigned', 'confirmed'));
  end if;
end $$;
