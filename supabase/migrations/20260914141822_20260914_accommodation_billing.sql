-- Accommodation acknowledgement, invoice, payment account and receipt workflow.
alter table recruitment_staff_permit_cases
  add column if not exists accommodation_terms_acknowledged_at timestamptz,
  add column if not exists accommodation_terms_version text,
  add column if not exists accommodation_terms_acknowledged_name text,
  add column if not exists accommodation_invoice_requested_at timestamptz;

create table if not exists recruitment_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  bank_name text not null,
  iban text,
  bic_swift text,
  account_number text,
  sort_code text,
  branch_details text,
  payment_reference_instructions text,
  currency text not null default 'EUR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists recruitment_payment_accounts_active_uq on recruitment_payment_accounts(is_active) where is_active = true;
alter table recruitment_payment_accounts enable row level security;
revoke all on recruitment_payment_accounts from anon, authenticated;

create table if not exists recruitment_accommodation_invoices (
  id uuid primary key default gen_random_uuid(),
  permit_case_id uuid not null unique references recruitment_staff_permit_cases(id) on delete cascade,
  invoice_number text not null unique,
  public_token text not null unique,
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  amount_eur numeric(12,2) not null default 4000,
  currency text not null default 'EUR',
  description text not null default 'Accommodation arrangement for initial three-month probationary period',
  bill_to_name text,
  bill_to_email text,
  payment_account_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  issued_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  payment_method text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft','issued','paid','cancelled')),
  check (amount_eur >= 0)
);
create index if not exists recruitment_accommodation_invoices_status_idx on recruitment_accommodation_invoices(status);
alter table recruitment_accommodation_invoices enable row level security;
revoke all on recruitment_accommodation_invoices from anon, authenticated;

create table if not exists recruitment_accommodation_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references recruitment_accommodation_invoices(id) on delete cascade,
  receipt_number text not null unique,
  issued_at timestamptz not null default now(),
  amount_eur numeric(12,2) not null,
  currency text not null default 'EUR',
  paid_at timestamptz not null,
  payment_reference text,
  payment_method text,
  issued_by text,
  notes text,
  created_at timestamptz not null default now()
);
alter table recruitment_accommodation_receipts enable row level security;
revoke all on recruitment_accommodation_receipts from anon, authenticated;

create index if not exists recruitment_accommodation_receipts_paid_at_idx on recruitment_accommodation_receipts(paid_at);
