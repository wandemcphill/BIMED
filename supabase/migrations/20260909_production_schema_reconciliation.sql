-- Production reconciliation for the BIMED workforce engine.
-- Safe/idempotent: aligns older live table shapes with the application contract
-- while preserving any existing data. Workforce tables were empty when first aligned.

alter table if exists public.recruitment_staff add column if not exists preferred_name text;
alter table if exists public.recruitment_staff add column if not exists date_of_birth date;
alter table if exists public.recruitment_staff add column if not exists nationality text;
alter table if exists public.recruitment_staff add column if not exists role text;
alter table if exists public.recruitment_staff add column if not exists primary_location text;
alter table if exists public.recruitment_staff add column if not exists manager_name text;
alter table if exists public.recruitment_staff add column if not exists address_line_1 text;
alter table if exists public.recruitment_staff add column if not exists address_line_2 text;
alter table if exists public.recruitment_staff add column if not exists city text;
alter table if exists public.recruitment_staff add column if not exists county text;
alter table if exists public.recruitment_staff add column if not exists eircode text;
alter table if exists public.recruitment_staff add column if not exists country text default 'Ireland';
alter table if exists public.recruitment_staff add column if not exists pps_status text default 'pending';
alter table if exists public.recruitment_staff add column if not exists tax_status text default 'pending';
alter table if exists public.recruitment_staff add column if not exists revenue_reference text;
alter table if exists public.recruitment_staff add column if not exists bank_account_name text;
alter table if exists public.recruitment_staff add column if not exists iban text;
alter table if exists public.recruitment_staff add column if not exists bic text;
alter table if exists public.recruitment_staff add column if not exists emergency_contact_name text;
alter table if exists public.recruitment_staff add column if not exists emergency_contact_relationship text;
alter table if exists public.recruitment_staff add column if not exists emergency_contact_phone text;
alter table if exists public.recruitment_staff add column if not exists profile_photo_path text;
alter table if exists public.recruitment_staff add column if not exists profile_photo_updated_at timestamptz;
alter table if exists public.recruitment_staff add column if not exists session_version integer not null default 1;
alter table if exists public.recruitment_staff add column if not exists last_login_at timestamptz;
alter table if exists public.recruitment_staff add column if not exists notes text;

alter table if exists public.recruitment_staff_payslips add column if not exists payment_date date;
alter table if exists public.recruitment_staff_payslips add column if not exists currency text default 'EUR';
alter table if exists public.recruitment_staff_payslips add column if not exists status text default 'issued';
alter table if exists public.recruitment_staff_payslips add column if not exists pdf_path text;
alter table if exists public.recruitment_staff_payslips add column if not exists notes text;
alter table if exists public.recruitment_staff_payslips add column if not exists issued_at timestamptz default now();

alter table if exists public.recruitment_workforce_shifts add column if not exists staff_id uuid;
alter table if exists public.recruitment_workforce_shifts add column if not exists shift_date date;
alter table if exists public.recruitment_workforce_shifts add column if not exists start_at timestamptz;
alter table if exists public.recruitment_workforce_shifts add column if not exists end_at timestamptz;
alter table if exists public.recruitment_workforce_shifts add column if not exists shift_type text;
alter table if exists public.recruitment_workforce_shifts add column if not exists role text;
alter table if exists public.recruitment_workforce_shifts add column if not exists break_minutes integer default 0;
alter table if exists public.recruitment_workforce_shifts add column if not exists assigned_at timestamptz;
alter table if exists public.recruitment_workforce_shifts add column if not exists completed_at timestamptz;
alter table if exists public.recruitment_workforce_shifts add column if not exists cancelled_at timestamptz;
alter table if exists public.recruitment_workforce_shifts add column if not exists cancellation_reason text;
alter table if exists public.recruitment_workforce_shifts alter column title drop not null;
alter table if exists public.recruitment_workforce_shifts alter column start_time drop not null;
alter table if exists public.recruitment_workforce_shifts alter column end_time drop not null;
alter table if exists public.recruitment_workforce_shifts alter column shift_date set not null;
alter table if exists public.recruitment_workforce_shifts alter column start_at set not null;
alter table if exists public.recruitment_workforce_shifts alter column end_at set not null;
alter table if exists public.recruitment_workforce_shifts alter column shift_type set not null;
alter table if exists public.recruitment_workforce_shifts alter column status set default 'available';

alter table if exists public.recruitment_shift_requests add column if not exists responded_by text;
alter table if exists public.recruitment_shift_requests add column if not exists responded_at timestamptz;
alter table if exists public.recruitment_leave_requests add column if not exists responded_by text;
alter table if exists public.recruitment_leave_requests add column if not exists responded_at timestamptz;
alter table if exists public.recruitment_staff_notifications add column if not exists category text;
alter table if exists public.recruitment_staff_notifications add column if not exists body text;
alter table if exists public.recruitment_staff_notifications add column if not exists action_url text;
alter table if exists public.recruitment_staff_notifications add column if not exists email_sent_at timestamptz;
alter table if exists public.recruitment_staff_notifications add column if not exists sms_sent_at timestamptz;
alter table if exists public.recruitment_staff_notifications alter column message drop not null;
alter table if exists public.recruitment_staff_audit_log add column if not exists event_type text;

create extension if not exists btree_gist;

drop trigger if exists trg_recruitment_staff_shift_overlap on public.recruitment_workforce_shifts;
drop function if exists public.prevent_staff_shift_overlap();

create or replace function public.set_bimed_staff_number()
returns trigger
language plpgsql
set search_path = public
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

drop trigger if exists recruitment_staff_identity_trigger on public.recruitment_staff;
create trigger recruitment_staff_identity_trigger
before insert on public.recruitment_staff
for each row execute function public.set_bimed_staff_number();

alter table public.recruitment_staff enable row level security;
alter table public.recruitment_staff_payslips enable row level security;
alter table public.recruitment_workforce_shifts enable row level security;
alter table public.recruitment_shift_requests enable row level security;
alter table public.recruitment_leave_requests enable row level security;
alter table public.recruitment_staff_notifications enable row level security;
alter table public.recruitment_staff_audit_log enable row level security;
alter table public.recruitment_staff_attendance enable row level security;
alter table public.recruitment_staff_document_packets enable row level security;

revoke all on table public.recruitment_staff, public.recruitment_staff_payslips, public.recruitment_workforce_shifts, public.recruitment_shift_requests, public.recruitment_leave_requests, public.recruitment_staff_notifications, public.recruitment_staff_audit_log, public.recruitment_staff_attendance, public.recruitment_staff_document_packets from anon, authenticated;
grant all on table public.recruitment_staff, public.recruitment_staff_payslips, public.recruitment_workforce_shifts, public.recruitment_shift_requests, public.recruitment_leave_requests, public.recruitment_staff_notifications, public.recruitment_staff_audit_log, public.recruitment_staff_attendance, public.recruitment_staff_document_packets to service_role;

-- Preserve the service-role-only database access model.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff' and policyname='recruitment_staff_service_role_only') then
    create policy recruitment_staff_service_role_only on public.recruitment_staff as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff_payslips' and policyname='recruitment_staff_payslips_service_role_only') then
    create policy recruitment_staff_payslips_service_role_only on public.recruitment_staff_payslips as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_workforce_shifts' and policyname='recruitment_workforce_shifts_service_role_only') then
    create policy recruitment_workforce_shifts_service_role_only on public.recruitment_workforce_shifts as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_shift_requests' and policyname='recruitment_shift_requests_service_role_only') then
    create policy recruitment_shift_requests_service_role_only on public.recruitment_shift_requests as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_leave_requests' and policyname='recruitment_leave_requests_service_role_only') then
    create policy recruitment_leave_requests_service_role_only on public.recruitment_leave_requests as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff_notifications' and policyname='recruitment_staff_notifications_service_role_only') then
    create policy recruitment_staff_notifications_service_role_only on public.recruitment_staff_notifications as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff_audit_log' and policyname='recruitment_staff_audit_log_service_role_only') then
    create policy recruitment_staff_audit_log_service_role_only on public.recruitment_staff_audit_log as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff_attendance' and policyname='recruitment_staff_attendance_service_role_only') then
    create policy recruitment_staff_attendance_service_role_only on public.recruitment_staff_attendance as restrictive for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='recruitment_staff_document_packets' and policyname='recruitment_staff_document_packets_service_role_only') then
    create policy recruitment_staff_document_packets_service_role_only on public.recruitment_staff_document_packets as restrictive for all to service_role using (true) with check (true);
  end if;
end $$;
