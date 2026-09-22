-- Shared accommodation relationship schema.

begin;
-- Shared accommodation partner linking and per-person invoicing.
-- A shared arrangement always produces one invoice per candidate for half of the
-- accommodation total, while retaining one shared arrangement reference.


create table if not exists public.recruitment_accommodation_shares (
  id uuid primary key default gen_random_uuid(),
  share_reference text not null unique,
  accommodation_plan text not null,
  total_amount_eur numeric(12,2) not null,
  share_amount_eur numeric(12,2) not null,
  accommodation_period_months integer not null,
  primary_staff_id uuid not null references public.recruitment_staff(id) on delete cascade,
  partner_staff_id uuid not null references public.recruitment_staff(id) on delete cascade,
  status text not null default 'active',
  created_by text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  check (primary_staff_id <> partner_staff_id),
  check (accommodation_plan in ('three_months_4000','one_month_1250')),
  check (total_amount_eur > 0),
  check (share_amount_eur > 0),
  check (share_amount_eur * 2 = total_amount_eur),
  check (status in ('active','cancelled'))
);

create unique index if not exists recruitment_accommodation_shares_active_primary_uq
  on public.recruitment_accommodation_shares(primary_staff_id)
  where status = 'active';

create unique index if not exists recruitment_accommodation_shares_active_partner_uq
  on public.recruitment_accommodation_shares(partner_staff_id)
  where status = 'active';

alter table public.recruitment_accommodation_shares enable row level security;
revoke all on public.recruitment_accommodation_shares from anon, authenticated;

alter table public.recruitment_staff_permit_cases
  add column if not exists accommodation_share_id uuid references public.recruitment_accommodation_shares(id),
  add column if not exists accommodation_share_role text,
  add column if not exists accommodation_share_partner_staff_id uuid references public.recruitment_staff(id);

alter table public.recruitment_staff_permit_cases
  drop constraint if exists recruitment_staff_permit_cases_accommodation_share_role_check,
  drop constraint if exists recruitment_staff_permit_cases_accommodation_plan_check;

alter table public.recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_accommodation_share_role_check
    check (accommodation_share_role is null or accommodation_share_role in ('primary','partner')),
  add constraint recruitment_staff_permit_cases_accommodation_plan_check
    check (accommodation_plan is null or accommodation_plan in ('three_months_4000','three_months_shared_2000','one_month_1250','one_month_shared_625'));

create index if not exists recruitment_staff_permit_cases_accommodation_share_id_idx
  on public.recruitment_staff_permit_cases(accommodation_share_id);


commit;
