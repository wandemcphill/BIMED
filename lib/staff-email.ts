import type { SupabaseClient } from '@supabase/supabase-js';

const BIMED_EMAIL_DOMAIN = 'bimedhealthcare.com';

function normalizeNamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function emailBase(fullName: string) {
  const parts = fullName.trim().split(/\s+/).map(normalizeNamePart).filter(Boolean);
  if (!parts.length) return 'staff';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

export async function generateBimedPortalEmail(client: SupabaseClient, fullName: string) {
  const base = emailBase(fullName) || 'staff';

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const local = suffix === 0 ? base : `${base}${suffix + 1}`;
    const email = `${local}@${BIMED_EMAIL_DOMAIN}`;
    const { data, error } = await client.from('recruitment_staff').select('id').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!data) return email;
  }

  throw new Error('Unable to allocate a unique BIMED portal email address.');
}

export const BIMED_EMAIL_DOMAIN_NAME = BIMED_EMAIL_DOMAIN;
