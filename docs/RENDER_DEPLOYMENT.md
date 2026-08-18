# Render Deployment Guide

The Bimed recruitment portal should be deployed as a **Render Web Service**, not on Vercel.

Repository-managed Blueprint:

- [render.yaml](/D:/BIMED/bimed-recruitment-portal/render.yaml)

Expected public domain:

- `recruitment.bimedhealthcare.com`

Do not change Bimed's main website or DNS configuration beyond the records required for this subdomain and email verification.

## 1. Render service settings

- Service type: **Web Service**
- Runtime: **Node**
- Region: choose the closest supported region for Bimed's user base
- Auto-deploy: enabled in `render.yaml` via `autoDeployTrigger: commit`

## 2. Build command

```bash
npm run build
```

## 3. Start command

```bash
npm run start
```

## 4. Required environment variables

Set these in the Render dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ADMIN_PASSWORD`
- `ADMIN_NOTIFICATION_EMAIL`
- `NEXT_PUBLIC_APP_URL`

The Blueprint in [render.yaml](/D:/BIMED/bimed-recruitment-portal/render.yaml) marks the sensitive values with `sync: false`, so Render will prompt for them during initial Blueprint creation instead of storing secrets in Git.

Recommended values:

- `EMAIL_FROM=Bimed Healthcare <info@bimedhealthcare.com>`
- `ADMIN_NOTIFICATION_EMAIL=info@bimedhealthcare.com`
- `NEXT_PUBLIC_APP_URL=https://recruitment.bimedhealthcare.com`

Render already provides `PORT` and `NODE_ENV=production` at runtime.

## 5. Node version

- Use **Node 20.x**
- The repository pins this in `package.json` under `engines.node`

## 6. Health-check path

- `GET /api/health`

This endpoint returns a simple JSON payload with `ok: true` and a timestamp.

## 7. Database configuration

Use Supabase as the production PostgreSQL backend.

Required setup:

1. Create or select the Supabase project.
2. Run `supabase/schema.sql`.
3. Store the Supabase project URL in `NEXT_PUBLIC_SUPABASE_URL`.
4. Store the Supabase service-role key in `SUPABASE_SERVICE_ROLE_KEY`.

Notes:

- The service-role key must stay server-side only.
- No Supabase secrets should be committed to Git.
- The app uses Supabase directly from server routes, not from the public client bundle.

## 8. Resend configuration

Use Resend for transactional email.

Required setup:

1. Create a Resend API key.
2. Store it in `RESEND_API_KEY`.
3. Confirm the sender identity in `EMAIL_FROM`.
4. Verify the `bimedhealthcare.com` sending domain in Resend if Bimed wants mail to come from that domain.

Important:

- Domain verification will require DNS changes under Bimed's control.
- Do not change any unrelated DNS records or the existing website.
- If DNS is not yet approved, keep the sender configurable and use a verified fallback sender for staging.

## 9. Custom-domain configuration

To use `recruitment.bimedhealthcare.com`:

1. Add the custom domain in Render for the Web Service.
2. Have Bimed's DNS administrator create the required Render record:
   - typically a `CNAME` for the subdomain, or the record type Render specifies
3. Wait for Render to verify the domain.
4. Enable HTTPS in Render after verification.
5. Set `NEXT_PUBLIC_APP_URL=https://recruitment.bimedhealthcare.com`.

This keeps the recruitment portal separate from the main Bimed website.

## 10. Production security checklist

- Keep all secrets in Render environment variables.
- Never commit `.env.local` or service-role keys.
- Use a strong, unique `ADMIN_PASSWORD` for the MVP.
- Replace the password gate with proper authentication before public launch.
- Verify the Supabase service-role key is only used server-side.
- Keep the health endpoint free of sensitive information.
- Confirm the Resend sender domain before production mail is enabled.
- Review the application text for Bimed-specific legal and GDPR wording before launch.
- Ensure Render uses HTTPS for the custom domain.
- Monitor Render logs and application errors after deployment.
- Rotate API keys if they are ever exposed.

## 11. Production logging

The application logs server-side errors with `console.error(...)`, which Render will surface in its service logs.

Recommended follow-up:

- Add structured logging if Bimed wants audit trails.
- Review production logs after the first real applications are submitted.
