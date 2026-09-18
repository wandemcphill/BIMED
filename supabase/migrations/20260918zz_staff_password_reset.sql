create table if not exists public.recruitment_staff_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.recruitment_staff(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists recruitment_staff_password_reset_tokens_staff_idx
  on public.recruitment_staff_password_reset_tokens (staff_id, created_at desc);

create index if not exists recruitment_staff_password_reset_tokens_expiry_idx
  on public.recruitment_staff_password_reset_tokens (expires_at)
  where consumed_at is null;

revoke all on table public.recruitment_staff_password_reset_tokens from public, anon, authenticated;
grant all on table public.recruitment_staff_password_reset_tokens to service_role;
