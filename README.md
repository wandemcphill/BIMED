# Bimed Healthcare Recruitment Portal MVP

Built around Bimed's shortlist-first recruitment workflow: CV arrives by email, Bimed selects candidates, then sends a private link. Candidates complete the guided application and send supporting documents separately.

## MVP features
- Private invitation tokens, hashed in database
- Atomic single-use invitation consumption
- Mobile-first Bimed-styled candidate portal
- Seven-step guided application
- Ireland vs international pathway
- Work-permission question for overseas candidates
- No document uploads
- Supporting-document checklist
- Submission + candidate confirmation email + Bimed notification email
- Admin dashboard for creating private links and viewing submissions
- Interview scheduling with invitation, reschedule and cancellation emails
- Candidate status-update emails and admin password recovery
- Supabase persistence with RLS defense-in-depth
- Database-backed admin sessions with revocation and account-state checking
- Distributed rate limiting that fails closed
- Server-side request schemas and bounded request payloads

## Email routing
Local candidate notifications: recruitment@bimedhealthcare.com
International candidate notifications: overseas@bimedhealthcare.com
Manager notifications: manager@bimedhealthcare.com
Admin notifications: info@bimedhealthcare.com

## Transactional email
Resend is the only outbound email provider and runs server-side only. `RESEND_API_KEY` is
read exclusively in `lib/email/transport.ts` and must never be exposed through a
`NEXT_PUBLIC_` variable or committed to Git. See
[docs/RESEND_EMAIL.md](/D:/BIMED/bimed-recruitment-portal/docs/RESEND_EMAIL.md) for the full
integration, password-recovery flow, testing and troubleshooting guide.

Without `RESEND_API_KEY` the portal still runs: sends are skipped and logged rather than
failing a submission.

## Setup
1. Create Supabase project and run `supabase/schema.sql`. Re-run it after upgrades so the
   transactional invitation function, RLS, admin sessions and retention procedure are applied.
2. Copy `.env.example` to `.env.local` and fill values.
3. `npm install`
4. `npm run dev`
5. Admin: `/admin`

## Checks
```bash
npm run typecheck
npm test
npm run build
```

## Data retention
The production policy retains recruitment applications and related records for 730 days by
default. Email delivery logs are retained for 180 days, expired password-reset records for 30
days, rate-limit buckets for 3 days and used/expired invitations for 90 days. A Render cron job runs
the Supabase `purge_recruitment_data` function daily at 03:00 UTC.

Set `RECRUITMENT_RETENTION_DAYS` only to an approved Bimed policy value between 30 and 3650 days.
Do not enable automated deletion before Bimed has approved the retention period for its legal and
HR requirements.

## Render deployment
This project is prepared for a Render Web Service plus a scheduled retention Cron Job.

- Web blueprint: [`render.yaml`](/D:/BIMED/bimed-recruitment-portal/render.yaml)
- Build command: `npm run build`
- Start command: `npm run start`
- Health check: `GET /api/health`
- Primary domain: `recruitment.bimedhealthcare.com`
- Retention schedule: daily at `03:00 UTC`

Required environment variables on the web service:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_DIRECT_URL`
- `SUPABASE_DB_SESSION_URL`
- `SUPABASE_DB_TRANSACTION_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `BIMED_LOCAL_RECRUITMENT_EMAIL`
- `BIMED_OVERSEAS_RECRUITMENT_EMAIL`
- `BIMED_MANAGER_EMAIL`
- `BIMED_ADMIN_EMAIL`
- `RECRUITMENT_ADMIN_EMAIL` (optional extra internal recipient)
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `ADMIN_BOOTSTRAP_NAME`
- `ADMIN_SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

The retention Cron Job additionally requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RECRUITMENT_RETENTION_DAYS`

## Production hardening and validation
Before first launch, apply `supabase/schema.sql` to the production Supabase database, confirm the
Resend sending domain, confirm the approved retention period, and verify backups and monitoring.

CI must pass `npm ci`, typecheck, tests and production build. After deployment, verify:

1. `/api/health` responds successfully.
2. Admin login creates a session and logout revokes it.
3. A candidate invitation can be used exactly once, including under concurrent submission attempts.
4. A complete candidate submission creates the application and expected email notifications.
5. Status and interview notifications work.
6. Password recovery works and old sessions are invalidated after password reset.
7. The retention cron can execute the database purge function successfully.
