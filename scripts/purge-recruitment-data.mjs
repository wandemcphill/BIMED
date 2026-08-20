import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const retentionDays = Number.parseInt(process.env.RECRUITMENT_RETENTION_DAYS || '730', 10);

if (!url || !serviceKey) {
  console.error('Retention job cannot run: Supabase environment variables are missing.');
  process.exit(1);
}

if (!Number.isFinite(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
  console.error('RECRUITMENT_RETENTION_DAYS must be between 30 and 3650.');
  process.exit(1);
}

const client = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await client.rpc('purge_recruitment_data', {
  p_application_retention_days: retentionDays,
  p_email_log_retention_days: 180,
  p_rate_limit_retention_days: 3,
  p_invite_retention_days: 90,
  p_password_reset_retention_days: 30,
});

if (error) {
  console.error(JSON.stringify({ event: 'retention.failed', message: error.message }));
  process.exit(1);
}

console.log(JSON.stringify({ event: 'retention.completed', retention_days: retentionDays, result: data }));
