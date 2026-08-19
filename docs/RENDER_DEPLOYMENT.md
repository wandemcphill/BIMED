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
- `SUPABASE_DB_DIRECT_URL`
- `SUPABASE_DB_SESSION_URL`
- `SUPABASE_DB_TRANSACTION_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `BIMED_LOCAL_RECRUITMENT_EMAIL`
- `BIMED_OVERSEAS_RECRUITMENT_EMAIL`
- `BIMED_MANAGER_EMAIL`
- `BIMED_ADMIN_EMAIL`
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`
- `ADMIN_BOOTSTRAP_NAME`
- `ADMIN_SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

The Blueprint in [render.yaml](/D:/BIMED/bimed-recruitment-portal/render.yaml) marks the sensitive values with `sync: false`, so Render will prompt for them during initial Blueprint creation instead of storing secrets in Git.

Recommended values:

- `RESEND_FROM_EMAIL=noreply@bimedhealthcare.com`
- `BIMED_LOCAL_RECRUITMENT_EMAIL=recruitment@bimedhealthcare.com`
- `BIMED_OVERSEAS_RECRUITMENT_EMAIL=overseas@bimedhealthcare.com`
- `BIMED_MANAGER_EMAIL=manager@bimedhealthcare.com`
- `BIMED_ADMIN_EMAIL=info@bimedhealthcare.com`
- `ADMIN_BOOTSTRAP_EMAIL=admin@bimedhealthcare.com`
- `ADMIN_BOOTSTRAP_PASSWORD=<strong temporary bootstrap password>`
- `ADMIN_BOOTSTRAP_NAME=Bimed Administrator`
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

Optional Postgres connection URLs, if you later add a raw SQL client, migration job, or ORM:

- `SUPABASE_DB_DIRECT_URL`
- `SUPABASE_DB_SESSION_URL`
- `SUPABASE_DB_TRANSACTION_URL`

Recommended usage:

- Use the direct connection URL for long-running server processes and maintenance tasks.
- Use the session pooler URL if your environment is IPv4-only and direct connections are not available.
- Use the transaction pooler URL for serverless or highly transient workloads.
- For this Render Web Service, you do not need a raw Postgres connection URL today because the app uses `@supabase/supabase-js` with the service-role key.

## 8. Resend configuration

Use Resend for transactional email.

Required setup:

1. Create a Resend API key.
2. Store it in `RESEND_API_KEY`.
3. Store the sender identity in `RESEND_FROM_EMAIL`.
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
- Use a strong, unique `ADMIN_BOOTSTRAP_PASSWORD` for initial admin creation.
- Change or remove bootstrap credentials after the first admin account is created.
- Keep `ADMIN_SESSION_SECRET` long and random.
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

## 12. Render setup checklist

Use this as the exact order to configure the Render Web Service.

### Step 1: Create the service

- Create a new **Web Service** in Render.
- Connect the GitHub repository.
- Choose the `render.yaml` Blueprint when prompted.

### Step 2: Confirm runtime settings

- Runtime: **Node**
- Build command: `npm run build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Region: choose the closest supported region for Bimed's user base

### Step 3: Enter environment variables in this order

Use the same order as the Blueprint below so the dashboard setup stays easy to verify:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_DB_DIRECT_URL`
4. `SUPABASE_DB_SESSION_URL`
5. `SUPABASE_DB_TRANSACTION_URL`
6. `RESEND_API_KEY`
7. `RESEND_FROM_EMAIL`
8. `BIMED_LOCAL_RECRUITMENT_EMAIL`
9. `BIMED_OVERSEAS_RECRUITMENT_EMAIL`
10. `BIMED_MANAGER_EMAIL`
11. `BIMED_ADMIN_EMAIL`
12. `ADMIN_BOOTSTRAP_EMAIL`
13. `ADMIN_BOOTSTRAP_PASSWORD`
14. `ADMIN_BOOTSTRAP_NAME`
15. `ADMIN_SESSION_SECRET`
16. `NEXT_PUBLIC_APP_URL`

### Step 4: Use these recommended values

- `RESEND_FROM_EMAIL=noreply@bimedhealthcare.com`
- `BIMED_LOCAL_RECRUITMENT_EMAIL=recruitment@bimedhealthcare.com`
- `BIMED_OVERSEAS_RECRUITMENT_EMAIL=overseas@bimedhealthcare.com`
- `BIMED_MANAGER_EMAIL=manager@bimedhealthcare.com`
- `BIMED_ADMIN_EMAIL=info@bimedhealthcare.com`
- `ADMIN_BOOTSTRAP_EMAIL=admin@bimedhealthcare.com`
- `ADMIN_BOOTSTRAP_PASSWORD=<strong temporary bootstrap password>`
- `ADMIN_BOOTSTRAP_NAME=Bimed Administrator`
- `NEXT_PUBLIC_APP_URL=https://recruitment.bimedhealthcare.com`

### Step 5: Run the database setup

- Run `supabase/schema.sql` in the Supabase project before the first production deployment.
- Confirm the admin users table and rate-limit table were created successfully.

### Step 6: Configure the custom domain

- Add `recruitment.bimedhealthcare.com` in Render after the service is created.
- Keep Bimed's main website unchanged.
- Allow Render to provision HTTPS after DNS verification.

### Step 7: Final production checks

- Confirm the service builds successfully in Render.
- Confirm the health check reports `ok: true`.
- Confirm candidate emails and internal notifications are sent from the configured Resend sender.
- Confirm all secrets are stored only in Render environment variables.
