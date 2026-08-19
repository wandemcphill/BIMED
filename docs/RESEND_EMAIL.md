# Resend transactional email

Resend is the portal's only outbound email provider. It is used entirely server-side.

## 1. What Resend is used for

| Event | Trigger | Candidate email | Internal email |
| --- | --- | --- | --- |
| Application submitted | `POST /api/applications` | Application received | New application received |
| Application status changed | `PATCH /api/admin/applications/[id]` | Status update (notifiable statuses only) | Status changed |
| Interview scheduled | `POST /api/admin/applications/[id]/interviews` | Interview invitation | Interview scheduled |
| Interview rescheduled | `PATCH .../interviews` with `action: "reschedule"` | Interview rescheduled | Interview rescheduled |
| Interview cancelled | `PATCH .../interviews` with `action: "cancel"` | Interview cancelled | Interview cancelled |
| Admin password reset requested | `POST /api/admin/password-reset` | — | Reset link to the admin's own address |

Candidates never have portal accounts, so there is no candidate-facing password reset. The
portal remains invitation-only.

## 2. Required environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes, for delivery | Server-only Resend key. Without it the app still works and simply logs that email was skipped. |
| `RESEND_FROM_EMAIL` | Recommended | Sender address or full identity. A bare address is wrapped as `Bimed Healthcare <address>`. |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL used to build admin record links and password-reset links. |
| `BIMED_LOCAL_RECRUITMENT_EMAIL` | Yes | Ireland-based candidate routing and internal notification. |
| `BIMED_OVERSEAS_RECRUITMENT_EMAIL` | Yes | International candidate routing and internal notification. |
| `BIMED_MANAGER_EMAIL` | Yes | Manager notification. |
| `BIMED_ADMIN_EMAIL` | Yes | Admin notification and privacy contact. |
| `RECRUITMENT_ADMIN_EMAIL` | Optional | Extra internal recipient added to every recruitment notification. |

`RESEND_API_KEY` must never be prefixed with `NEXT_PUBLIC_`, committed, or placed in
documentation. It is read only in `lib/email/transport.ts`, which is server-only.

## 3. Configuring `RESEND_API_KEY`

1. In Resend, open the API key created for "BIMED Recruitment Portal" (or create one).
2. In Render: **Service → Environment → Add Environment Variable**, key `RESEND_API_KEY`,
   value the secret. `render.yaml` marks it `sync: false`, so it is never stored in Git.
3. Locally, put it in `.env.local` (already git-ignored). Never in `.env.example`.
4. Redeploy. The key is read per request, so no rebuild is needed after rotation.

To rotate: create the new key in Resend, update the Render variable, redeploy, then revoke
the old key.

## 4. Configuring the sender

The domain `bimedhealthcare.com` is verified in Resend (DKIM, SPF MX and SPF TXT all
verified), so any address at that domain can send.

- Default when unset: `Bimed Healthcare <noreply@bimedhealthcare.com>`.
- `RESEND_FROM_EMAIL=noreply@bimedhealthcare.com` → `Bimed Healthcare <noreply@bimedhealthcare.com>`
- `RESEND_FROM_EMAIL=Bimed Recruitment <recruitment@bimedhealthcare.com>` is used verbatim.

Reply-to is set per message so candidate replies reach a monitored inbox: the pathway-based
recruitment address for application mail, and the admin address for account mail.

## 5. How password recovery works

This project does **not** use Supabase Auth. Supabase is used purely as Postgres via the
service-role key, and admin credentials live in `recruitment_admin_users` with pbkdf2-sha256
hashes. The reset flow below is therefore the only reset mechanism, not a parallel one.

1. An admin opens `/admin/forgot-password` and submits their email.
2. `POST /api/admin/password-reset` rate-limits the request (5/hour per IP), looks up an
   **active** admin, retires any earlier outstanding token, and creates a new one.
3. Only the SHA-256 hash of the token is stored, in `recruitment_admin_password_resets`,
   with a 30-minute expiry. The plaintext token exists only in the emailed link.
4. The endpoint always returns the same 200 response whether or not the account exists, so
   it cannot be used to enumerate admin accounts.
5. The admin follows the link to `/admin/reset-password?token=...` and chooses a new password
   (minimum 12 characters, at least one letter and one number).
6. `POST /api/admin/password-reset/confirm` claims the token with a `used_at is null` guard —
   so two concurrent submissions cannot both succeed — then writes the new pbkdf2 hash.
7. Expired, already-used, unknown, and deactivated-account tokens are all rejected with a
   safe message and no password change.

Reset tokens are never logged. Both request and completion are recorded in
`recruitment_audit_log` by admin user id only.

## 6. Recruitment emails in detail

Candidate status emails are only sent for statuses that are meaningful to a candidate.
`Submitted` is excluded because the application-received email already covers it. The
notifiable set is defined by `CANDIDATE_STATUS_GUIDANCE` in `lib/email/index.ts` and uses the
existing `recruitmentStatuses` vocabulary — no new statuses were introduced.

Candidate emails contain: candidate name, position, application reference (`BIMED-XXXXXXXX`,
derived from the application id), current status, interview date/time in Irish time, location
or meeting link, next steps, and Bimed contact details. They deliberately exclude admin
notes, the admin record link, internal actor identities and other candidates' data.

An admin can suppress the candidate email for a status change by sending
`notify_candidate: false` in the PATCH body; internal staff are still notified.

## 7. Testing email functionality

```bash
npm test
```

69 tests cover templates, transport, the service layer and password reset. They never reach
Resend: the provider is replaced through `__setEmailSenderForTests` and no API key is set, so
no real email can be sent from the test suite.

To verify real delivery in a deployed environment:

1. Set `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL`.
2. Create an invitation in `/admin`, complete the application, and confirm the candidate
   confirmation and internal notification arrive.
3. Change the status on the candidate record and confirm the status email.
4. Schedule, reschedule and cancel an interview from the candidate record.
5. Request a password reset for a real admin address and complete it.
6. Cross-check each send against the Resend dashboard and the `recruitment_email_log` table.

## 8. Troubleshooting

Every email attempt emits a single-line JSON log. Search the Render logs for `"event":"email.`.

| Log event | Meaning | Action |
| --- | --- | --- |
| `email.not_configured` | `RESEND_API_KEY` is unset. Nothing was sent. | Set the key and redeploy. |
| `email.invalid_recipient` | Address failed validation (blank, malformed, or contained a comma/CR/LF). | Correct the stored address. |
| `email.duplicate_suppressed` | A matching email was already sent for this dedupe key. | Expected; no action. |
| `email.send_failed` with `retrying: true` | Transient error (timeout, 429, 5xx). Retried up to 3 times with backoff. | Usually self-resolving. |
| `email.send_failed` with `retrying: false` | Permanent error, e.g. unverified sender or rejected payload. | Check the Resend dashboard and sender config. |
| `email.dedupe_unavailable` | The database could not be reached for duplicate protection. The email was still sent. | Check Supabase availability. |
| `email.log_update_failed` | Delivery happened but the log row could not be updated. | Check Supabase availability. |

Logs never contain the API key, reset tokens, or full recipient addresses — recipients are
masked as `ad***@example.com`.

The `recruitment_email_log` table is the delivery record: `status` (`pending`/`sent`/`failed`),
`provider_message_id`, `attempts`, and a truncated `error_message`. To find failures:

```sql
select email_type, recipient_hint, attempts, error_message, created_at
from recruitment_email_log
where status = 'failed'
order by created_at desc;
```

To deliberately allow a resend after fixing a problem, delete that row's `dedupe_key` entry.

## 9. Production requirements

- Run `supabase/schema.sql` so `recruitment_email_log`,
  `recruitment_admin_password_resets` and `recruitment_interviews` exist. The script is
  idempotent and safe to re-run.
- Set `RESEND_API_KEY` in the deployment environment only.
- Set `NEXT_PUBLIC_APP_URL` to the production URL, otherwise reset and record links point at
  `http://localhost:3000`.
- Keep the sender on the verified `bimedhealthcare.com` domain.

## 10. Design notes

- **Failures never corrupt recruitment data.** The application row, interview row and status
  change are all committed before any email is attempted. The email service never throws; it
  returns a result, and route handlers log and continue.
- **Duplicate protection** is a unique `dedupe_key` in `recruitment_email_log`. Submission and
  interview emails are once-ever; status and interview-admin notices use a 10-minute window so
  an accidental double-click cannot repeat them while a legitimate later change still sends.
- **Injection.** All interpolated values are HTML-escaped, subjects are stripped of CR/LF and
  control characters, recipients are validated as a single plain address, and only `http(s)`
  URLs are rendered as links.
