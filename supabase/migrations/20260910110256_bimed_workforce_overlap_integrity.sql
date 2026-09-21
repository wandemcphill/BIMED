-- Protect live workforce scheduling from race-condition overlaps at the database boundary.
-- Existing data was checked before applying: no overlapping assigned/confirmed shifts and
-- no overlapping approved leave periods were present.

alter table public.recruitment_workforce_shifts
  add constraint recruitment_workforce_shifts_staff_time_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (staff_id is not null and status in ('assigned','confirmed'));

alter table public.recruitment_leave_requests
  add constraint recruitment_leave_requests_approved_no_overlap
  exclude using gist (
    staff_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status = 'approved');
