# Production Hardening Review

This repo now builds successfully and is suitable for a Render deployment, but a few production-hardening gaps remain.

## Implemented

- Invitation-only candidate flow.
- Hashed invitation tokens.
- Cookie-based admin session backed by signed admin account sessions.
- DB-backed admin accounts with bootstrap onboarding credentials.
- DB-backed rate limiting on login, invitation creation, and candidate submission.
- Audit logging for invitation creation, application submission, and admin candidate updates.
- Candidate detail view with editable status and notes.
- Render blueprint and health check endpoint.

## Remaining gaps

1. Legal and privacy wording still needs Bimed approval.
   - The candidate declaration, immigration guidance, and recruitment copy are configurable, but they are not yet Bimed-reviewed final text.

2. Backup and retention policy is still operational, not encoded.
   - Supabase and Render backups/retention should be verified and documented before launch.

3. The notification email still includes a useful record link, but delivery depends on a verified sender/domain.
   - Confirm the Resend domain configuration before production mail goes live.

## Recommended next steps

- Replace remaining placeholder legal/privacy text with approved Bimed content.
- Confirm backups, monitoring, and alerting in the Supabase and Render environments.
- Verify the Resend sending domain before enabling production email.
