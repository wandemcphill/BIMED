-- Attendance data is private workforce data. The Next.js server uses the
-- Supabase service role after staff/admin session checks, so browser roles do not
-- need direct table access.
alter table recruitment_staff_attendance enable row level security;
revoke all on table recruitment_staff_attendance from anon, authenticated;
