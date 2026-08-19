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
- Server-only Resend integration with retries, timeouts, structured logging and DB-backed
  duplicate-send protection (see [RESEND_EMAIL.md](/D:/BIMED/bimed-recruitment-portal/docs/RESEND_EMAIL.md)).
- Candidate emails for submission, status change, and interview invitation/reschedule/cancellation.
- Interview scheduling against the existing `Interview` status.
- Single-use, short-lived admin password recovery with no account enumeration.
- Automated test suite (`npm test`) covering templates, transport, service and reset flows.

## Remaining gaps

1. Legal and privacy wording still needs Bimed approval.
   - The candidate declaration, immigration guidance, and recruitment copy are configurable, but they are not yet Bimed-reviewed final text.

2. Backup and retention policy is still operational, not encoded.
   - Supabase and Render backups/retention should be verified and documented before launch.

3. Email delivery is not yet monitored proactively.
   - The `bimedhealthcare.com` sending domain is verified in Resend (DKIM, SPF MX, SPF TXT), and
     every attempt is recorded in `recruitment_email_log`, but nothing alerts on a
     `status = 'failed'` row yet. Add an alert or a scheduled check before launch.

4. Failed emails are logged but not automatically retried beyond the in-request attempts.
   - A send that exhausts its 3 attempts stays `failed` in `recruitment_email_log` and needs a
     manual resend. A scheduled sweep over failed rows would close this gap if Bimed wants it.

## Recommended next steps

- Replace remaining placeholder legal/privacy text with approved Bimed content.
- Confirm backups, monitoring, and alerting in the Supabase and Render environments.
- Alert on `recruitment_email_log.status = 'failed'`.
- Rotate the bootstrap admin credentials once real admin accounts exist.
