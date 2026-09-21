alter table public.recruitment_staff
  add column if not exists portal_restriction_reason text,
  add column if not exists portal_restricted_at timestamptz,
  add column if not exists portal_restricted_by text,
  add column if not exists portal_restriction_message text,
  add column if not exists portal_previous_status text;

alter table public.recruitment_accommodation_invoices
  add column if not exists admin_bill_to_name text,
  add column if not exists admin_bill_to_email text,
  add column if not exists admin_description text,
  add column if not exists admin_notes text;
