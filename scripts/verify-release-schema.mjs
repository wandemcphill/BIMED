import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Release schema check failed: Supabase environment variables are missing.');
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data, error } = await client.rpc('bimed_release_readiness_check');

if (error) {
  console.error('Release schema check failed:', error.message);
  process.exit(1);
}

if (!data?.ok) {
  console.error('Release schema check failed:', JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('Release schema check passed:', JSON.stringify(data));
