# Production Hardening Review

This repo now builds successfully and is suitable for a Render deployment, but a few production-hardening gaps remain.

## Implemented

- Invitation-only candidate flow.
- Hashed invitation tokens.
- Cookie-based admin session for the MVP.
- Rate limiting on login, invitation creation, and candidate submission.
- Audit logging for invitation creation, application submission, and admin candidate updates.
- Candidate detail view with editable status and notes.
- Render blueprint and health check endpoint.

## Remaining gaps

1. Admin access is still password-based, even though the session is now cookie-backed.
   - This is better than the original header-only approach, but it is still not true role-based authentication.
   - Before public launch, Bimed should move to a proper auth system with explicit admin accounts.

2. The current rate limiting is in-memory.
   - It is effective for a single instance, but it will not be shared across multiple Render instances or survive restarts.
   - If the service scales out, this should move to a shared store.

3. Legal and privacy wording still needs Bimed approval.
   - The candidate declaration, immigration guidance, and recruitment copy are configurable, but they are not yet Bimed-reviewed final text.

4. Backup and retention policy is still operational, not encoded.
   - Supabase and Render backups/retention should be verified and documented before launch.

5. The notification email still includes a useful record link, but delivery depends on a verified sender/domain.
   - Confirm the Resend domain configuration before production mail goes live.

## Recommended next steps

- Replace the password gate with proper authentication and role-based access.
- Move rate limiting to a shared store if the service will run more than one instance.
- Replace remaining placeholder legal/privacy text with approved Bimed content.
- Confirm backups, monitoring, and alerting in the Supabase and Render environments.
- Verify the Resend sending domain before enabling production email.
