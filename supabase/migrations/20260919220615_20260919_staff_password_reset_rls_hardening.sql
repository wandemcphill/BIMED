-- The reset-token table is service-role-only and must not be directly reachable
-- through the public Data API surface. Keep service_role access while adding
-- RLS as defense in depth.
alter table public.recruitment_staff_password_reset_tokens
  enable row level security;

revoke all on table public.recruitment_staff_password_reset_tokens
  from public, anon, authenticated;

grant all on table public.recruitment_staff_password_reset_tokens
  to service_role;
