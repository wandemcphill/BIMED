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
1. Create Supabase project and run `supabase/schema.sql`.
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

## Render deployment
This project is prepared for a Render Web Service.

- Blueprint: [`render.yaml`](/D:/BIMED/bimed-recruitment-portal/render.yaml)
- Build command: `npm run build`
- Start command: `npm run start`
- Health check: `GET /api/health`
- Primary domain: `recruitment.bimedhealthcare.com`

Required environment variables on Render:

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

Optional Supabase connection strings are documented in [`.env.example`](/D:/BIMED/bimed-recruitment-portal/.env.example) and [docs/RENDER_DEPLOYMENT.md](/D:/BIMED/bimed-recruitment-portal/docs/RENDER_DEPLOYMENT.md).

## Production hardening before launch
Finalize Bimed-approved legal/HR content; confirm backups, monitoring, and retention controls; verify the Resend sending domain; and keep the portal on a Bimed-controlled subdomain.
