# Production Hardening Review

This repo now builds successfully and is suitable for a Render deployment, but a few production-hardening gaps remain.

## Findings

1. The admin surface still uses a shared password passed in a request header and cached in `localStorage`.
   - This is present in the dashboard flow and API routes.
   - It is acceptable for MVP use, but it is not production-grade authentication.

2. Invitation creation and application submission do not have rate limiting.
   - A malicious actor could still hammer the public invite and application endpoints.
   - Render logs and password gates do not replace request throttling.

3. There is no audit trail for admin changes.
   - Status and notes are overwritten directly on the candidate record.
   - If Bimed needs compliance or dispute tracking later, change history will need to be added.

4. The current content still includes MVP/legal placeholders.
   - The candidate declaration, immigration wording, and privacy/GDPR language should be replaced with Bimed-approved copy before public launch.

5. No automated backup or retention policy is encoded in the app.
   - Supabase and Render backups/retention should be confirmed operationally before launch.

## Recommended next steps

- Replace the password gate with proper auth and role-based access.
- Add rate limiting to the invite and application endpoints.
- Introduce audit logging for invitation creation and candidate status changes.
- Replace remaining placeholder legal/privacy text with approved Bimed content.
- Confirm backups, monitoring, and alerting in the Supabase and Render environments.
