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
- Supabase persistence

## Email routing
International candidates: overseas@bimedhealthcare.com
Ireland-based candidates: info@bimedhealthcare.com

## Setup
1. Create Supabase project and run `supabase/schema.sql`.
2. Copy `.env.example` to `.env.local` and fill values.
3. `npm install`
4. `npm run dev`
5. Admin: `/admin`

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
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `ADMIN_NOTIFICATION_EMAIL`
- `NEXT_PUBLIC_APP_URL`

Optional Supabase connection strings are documented in [`.env.example`](/D:/BIMED/bimed-recruitment-portal/.env.example) and [docs/RENDER_DEPLOYMENT.md](/D:/BIMED/bimed-recruitment-portal/docs/RENDER_DEPLOYMENT.md).

## Production hardening before launch
Replace the MVP password-based admin session with proper authenticated admin access/MFA; finalize Bimed-approved legal/HR content; confirm backups, monitoring, and retention controls; and keep the portal on a Bimed-controlled subdomain.
