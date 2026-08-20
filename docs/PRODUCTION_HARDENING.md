# Production hardening

## Database migration

Run `supabase/schema.sql` first, then run:

```sql
-- supabase/migrations/20260820_production_hardening.sql
```

The migration adds atomic invitation/application creation, administrator session-version revocation, restrictive RLS, and the retention purge function. The application assumes the migration has been applied before deployment.

## Verifying the migration

After applying it, run [supabase/verify_production_hardening.sql](../supabase/verify_production_hardening.sql)
in the Supabase SQL editor. It is read-only and creates, alters and deletes
nothing. It returns 24 rows covering the `session_version` column, the three
RPCs, RLS on all eight recruitment tables, and the RPC grants.

**Every row must report PASS.** Against a database with only `schema.sql`
applied it reports 22 failures, including `check_recruitment_rate_limit` still
being executable by `anon`, `authenticated` and `public` — Postgres grants
EXECUTE to PUBLIC by default, and the migration is what revokes it. A run that
is not all-PASS means the portal must not be treated as live.

## Retention policy implemented

The scheduled purge job currently uses these defaults:

- Rejected or withdrawn applications: 24 months after the last update.
- Used invitations and expired invitations: 90 days.
- Transactional email delivery logs: 12 months.
- Password-reset tokens: 2 days after use or expiry.
- Rate-limit buckets: 7 days after last update.

These are technical defaults, not legal advice. Bimed should approve the periods against its recruitment/privacy obligations before launch. Changes belong in `purge_recruitment_data()` and this document should be updated with the approved policy.

## Render retention service

`render.yaml` defines a daily cron service that calls `purge_recruitment_data()` through the Supabase REST RPC endpoint using the service-role key. The cron job must be configured with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No Resend key is required by the retention service.

## Production deployment gate

Before treating the portal as live:

1. Apply the database migration in the production Supabase project.
2. Run `supabase/verify_production_hardening.sql` and confirm all 24 rows report PASS (this covers RLS on every recruitment table and the RPC grants).
3. Confirm the Render web service has the production environment variables.
4. Confirm the retention cron service is created and completes successfully.
5. Confirm Resend sender/domain verification remains active.
6. Confirm `GET /api/health` returns 200.
7. Complete a real invitation -> application -> internal/candidate email flow with a test candidate record, then verify the single-use invitation cannot submit twice.
8. Sign into `/admin`, verify application access, then change an admin account to inactive or increment `session_version` in a controlled test and confirm the prior session is rejected.
9. Verify the CI workflow passes typecheck, tests and production build.
