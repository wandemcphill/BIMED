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

## Production hardening before launch
Replace the MVP admin password with proper authenticated admin access/MFA; add rate limiting, audit logs, GDPR privacy/retention controls, backups/monitoring, and Bimed-approved legal/HR content. Put it on a Bimed-controlled subdomain.
