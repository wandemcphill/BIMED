-- Candidate payment reporting and cancellation requests for accommodation invoices.
alter table public.recruitment_accommodation_invoices
  add column if not exists payment_reported_at timestamptz,
  add column if not exists payment_reported_by text,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_requested_by text,
  add column if not exists cancellation_reason text,
  add column if not exists admin_action_at timestamptz,
  add column if not exists admin_action_by text;

alter table public.recruitment_accommodation_invoices
  drop constraint if exists recruitment_accommodation_invoices_status_check;

alter table public.recruitment_accommodation_invoices
  add constraint recruitment_accommodation_invoices_status_check
  check (status in ('draft','issued','payment_reported','cancellation_requested','paid','cancelled'));

create index if not exists recruitment_accommodation_invoices_action_status_idx
  on public.recruitment_accommodation_invoices(status, updated_at desc);
