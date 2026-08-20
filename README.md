# Bimed Healthcare Recruitment Portal MVP

Built around Bimed's shortlist-first recruitment workflow: CV arrives by email, Bimed selects candidates, then sends a private link. Candidates complete the guided application and send supporting documents separately.

## MVP features
- Private invitation tokens, hashed in database
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
- Supabase persistence
- DB-backed admin accounts and distributed rate limiting

## Production hardening
The `production-hardening` branch adds:
- atomic invitation consumption and application creation
- fail-closed rate limiting
- bounded JSON request bodies and server-side input validation
- server-side admin account-state checks and session-version revocation
- restrictive RLS on recruitment tables
- production security headers
- scheduled recruitment-data retention cleanup

Before deployment, apply `supabase/schema.sql` and then `supabase/migrations/20260820_production_hardening.sql` to the production Supabase project. See `docs/PRODUCTION_HARDENING.md` for the launch gate and retention periods.

## Email routing
Local candidate notifications: recruitment@bimedhealthcare.com
International candidate notifications: overseas@bimedhealthcare.com
Manager notifications: manager@bimedhealthcare.com
Admin notifications: info@bimedhealthcare.com

## Transactional email
Resend is the only outbound email provider and runs server-side only. `RESEND_API_KEY` is
read exclusively in `lib/email/transport.ts` and must never be exposed through a
`NEXT_PUBLIC_` variable or committed to Git. See
[docs/RESEND_EMAIL.md](docs/RESEND_EMAIL.md) for the full
integration, password-recovery flow, testing and troubleshooting guide.

Without `RESEND_API_KEY` the portal still runs: sends are skipped and logged rather than
failing a submission.

## Setup
1. Create Supabase project and run `supabase/schema.sql`.
2. Run `supabase/migrations/20260820_production_hardening.sql`.
3. Copy `.env.example` to `.env.local` and fill values.
4. `npm install`
5. `npm run dev`
6. Admin: `/admin`

## Checks
```bash
npm run typecheck
npm test
npm run build
```

## Render deployment
This project is prepared for a Render Web Service plus a daily retention Cron Job.

- Blueprint: [`render.yaml`](render.yaml)
- Web build command: `npm run build`
- Web start command: `npm run start`
- Health check: `GET /api/health`
- Primary domain: `recruitment.bimedhealthcare.com`
- Retention schedule: `03:00 UTC` daily

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

The retention Cron Job requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional Supabase connection strings are documented in [`.env.example`](.env.example) and [docs/RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md).

## Production hardening before launch
Finalize Bimed-approved legal/HR content; confirm the approved recruitment-data retention periods; verify backups and monitoring; verify the Resend sending domain; apply the production database migration; confirm the retention Cron Job succeeds; and keep the portal on a Bimed-controlled subdomain.
