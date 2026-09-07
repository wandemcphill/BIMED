-- ---------------------------------------------------------------------------
-- BIMED Healthcare Workforce Management Engine
-- ---------------------------------------------------------------------------
-- One permanent staff identity from recruitment through the employee lifecycle.
-- Application records are preserved; employee records are linked by application_id.

create sequence if not exists bimed_staff_number_seq start 1000;

create table if not exists recruitment_staff (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references recruitment_applications(id) on delete set null,
  bimed_id text unique,
  staff_number bigint unique,
  status text not null default 'pre_arrival',
  full_name text not null,
  preferred_name text,
  email text not null unique,
  phone text,
  date_of_birth date,
  nationality text,
  role text,
  department text,
  employment_type text,
  employment_start_date date,
  primary_location text,
  manager_name text,
  address_line_1 text,
  address_line_2 text,
  city text,
  county text,
  eircode text,
  country text default 'Ireland',
  pps_number text,
  pps_status text not null default 'pending',
  tax_status text not null default 'pending',
  revenue_reference text,
  bank_name text,
  bank_account_name text,
  iban text,
  bic text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  profile_photo_path text,
  profile_photo_updated_at timestamptz,
  password_hash text,
  session_version integer not null default 1,
  activation_token_hash text unique,
  activation_expires_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recruitment_staff
  alter column staff_number set default nextval('bimed_staff_number_seq');

create unique index if not exists recruitment_staff_bimed_id_idx on recruitment_staff(bimed_id);
create index if not exists recruitment_staff_status_idx on recruitment_staff(status, created_at desc);
create index if not exists recruitment_staff_application_idx on recruitment_staff(application_id);
create index if not exists recruitment_staff_email_idx on recruitment_staff(lower(email));

create or replace function assign_bimed_staff_identity()
returns trigger
language plpgsql
as $$
begin
  if new.staff_number is null then
    new.staff_number := nextval('bimed_staff_number_seq');
  end if;
  if new.bimed_id is null or btrim(new.bimed_id) = '' then
    new.bimed_id := 'BH-' || lpad(new.staff_number::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists recruitment_staff_identity_trigger on recruitment_staff;
create trigger recruitment_staff_identity_trigger
before insert on recruitment_staff
for each row execute function assign_bimed_staff_identity();

create table if not exists recruitment_staff_payslips (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references recruitment_staff(id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  payment_date date,
  basic_hours numeric(10,2) not null default 0,
  overtime_hours numeric(10,2) not null default 0,
  weekend_hours numeric(10,2) not null default 0,
  night_hours numeric(10,2) not null default 0,
  basic_amount numeric(12,2) not null default 0,
  overtime_amount numeric(12,2) not null default 0,
  weekend_amount numeric(12,2) not null default 0,
  night_amount numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  gross_pay numeric(12,2) not null default 0,
  paye numeric(12,2) not null default 0,
  prsi numeric(12,2) not null default 0,
  usc numeric(12,2) not null default 0,
  other_deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  status text not null default 'issued',
  pdf_path text,
  notes text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staff_id, pay_period_start, pay_period_end)
);

create index if not exists recruitment_staff_payslips_staff_idx
  on recruitment_staff_payslips(staff_id, pay_period_end desc);

create table if not exists recruitment_workforce_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references recruitment_staff(id) on delete set null,
  shift_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  shift_type text not null,
  role text,
  location text,
  break_minutes integer not null default 0,
  status text not null default 'available',
  created_by text,
  assigned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (break_minutes >= 0)
);

create index if not exists workforce_shifts_date_idx on recruitment_workforce_shifts(shift_date, start_at);
create index if not exists workforce_shifts_staff_idx on recruitment_workforce_shifts(staff_id, shift_date desc);
create index if not exists workforce_shifts_status_idx on recruitment_workforce_shifts(status, shift_date);

create table if not exists recruitment_shift_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references recruitment_workforce_shifts(id) on delete cascade,
  staff_id uuid not null references recruitment_staff(id) on delete cascade,
  request_type text not null default 'shift',
  status text not null default 'pending',
  reason text,
  responded_by text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shift_id, staff_id, request_type)
);

create index if not exists shift_requests_staff_idx on recruitment_shift_requests(staff_id, created_at desc);
create index if not exists shift_requests_status_idx on recruitment_shift_requests(status, created_at desc);
create index if not exists shift_requests_shift_idx on recruitment_shift_requests(shift_id, created_at desc);

create table if not exists recruitment_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references recruitment_staff(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type text not null default 'annual',
  status text not null default 'pending',
  reason text,
  responded_by text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_requests_staff_idx on recruitment_leave_requests(staff_id, start_date desc);
create index if not exists leave_requests_status_idx on recruitment_leave_requests(status, start_date);

create table if not exists recruitment_staff_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references recruitment_staff(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  action_url text,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_notifications_staff_idx
  on recruitment_staff_notifications(staff_id, created_at desc);
create index if not exists staff_notifications_unread_idx
  on recruitment_staff_notifications(staff_id, read_at, created_at desc);

create table if not exists recruitment_staff_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references recruitment_staff(id) on delete set null,
  actor text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_audit_staff_idx
  on recruitment_staff_audit_log(staff_id, created_at desc);

-- Photos live in the Supabase Storage bucket `bimed-staff-photos` and are referenced by
-- profile_photo_path. The bucket is intentionally private; application routes must issue
-- short-lived signed URLs after authenticating the viewer.
