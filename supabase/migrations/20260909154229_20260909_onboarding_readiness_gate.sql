create table if not exists public.recruitment_onboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.recruitment_applications(id) on delete cascade,
  item_key text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'completed', 'waived')),
  completed_at timestamptz,
  completed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, item_key)
);

create index if not exists recruitment_onboarding_checklist_application_idx
  on public.recruitment_onboarding_checklist(application_id);

create index if not exists recruitment_onboarding_checklist_gate_idx
  on public.recruitment_onboarding_checklist(application_id, required, status);

alter table public.recruitment_onboarding_checklist enable row level security;
revoke all on public.recruitment_onboarding_checklist from anon, authenticated;
grant all on public.recruitment_onboarding_checklist to service_role;

create or replace function public.set_recruitment_onboarding_checklist_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recruitment_onboarding_checklist_updated_at on public.recruitment_onboarding_checklist;
create trigger recruitment_onboarding_checklist_updated_at
before update on public.recruitment_onboarding_checklist
for each row execute function public.set_recruitment_onboarding_checklist_updated_at();
