-- Reconcile the live BIMED recruitment schema with the onboarding-pack contract-address fields.
-- This is intentionally idempotent because the live database may already have been repaired
-- outside migration history.

begin;

alter table if exists public.recruitment_applications
  add column if not exists contract_accommodation_option text not null default 'accommodation_not_verified',
  add column if not exists verified_irish_residential_address text,
  add column if not exists contract_accommodation_verified_at timestamptz,
  add column if not exists contract_accommodation_verified_by text;

update public.recruitment_applications
set contract_accommodation_option = 'accommodation_not_verified'
where contract_accommodation_option is null;

alter table public.recruitment_applications
  drop constraint if exists recruitment_applications_contract_accommodation_option_check;

alter table public.recruitment_applications
  add constraint recruitment_applications_contract_accommodation_option_check
  check (contract_accommodation_option in ('private_accommodation', 'accommodation_not_verified'));

create index if not exists recruitment_applications_contract_accommodation_option_idx
  on public.recruitment_applications(contract_accommodation_option);

commit;
