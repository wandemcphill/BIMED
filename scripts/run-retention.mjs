const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const response = await fetch(`${baseUrl}/rest/v1/rpc/purge_recruitment_data`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Retention purge failed (${response.status}): ${body.slice(0, 500)}`);
}

console.log(JSON.stringify({ event: 'retention.completed', result: await response.json(), at: new Date().toISOString() }));
