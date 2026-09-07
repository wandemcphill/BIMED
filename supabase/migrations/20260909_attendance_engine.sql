-- ---------------------------------------------------------------------------
-- BIMED Healthcare Attendance & Timesheet Engine
-- ---------------------------------------------------------------------------
-- Attendance is tied to the permanent employee identity and a specific rota
-- shift. Staff submit clock-in/clock-out records; BIMED approves or adjusts them.

create table if not exists recruitment_staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references recruitment_staff(id) on delete cascade,
  shift_id uuid not null references recruitment_workforce_shifts(id) on delete cascade,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_minutes integer not null default 0,
  status text not null default 'open',
  notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staff_id, shift_id),
  check (break_minutes >= 0 and break_minutes <= 720),
  check (clock_out_at is null or (clock_in_at is not null and clock_out_at > clock_in_at))
);

create index if not exists staff_attendance_staff_idx
  on recruitment_staff_attendance(staff_id, created_at desc);
create index if not exists staff_attendance_shift_idx
  on recruitment_staff_attendance(shift_id, created_at desc);
create index if not exists staff_attendance_status_idx
  on recruitment_staff_attendance(status, created_at desc);

comment on table recruitment_staff_attendance is 'Portal clock-in/out records for permanent BIMED staff. Admin approval is retained separately from the employee timestamps.';
