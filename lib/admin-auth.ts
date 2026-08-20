import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type AdminUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  active: boolean;
  session_version: number;
};

type BootstrapCredentials = {
  email: string;
  password: string;
  displayName: string;
};

const HASH_ALGORITHM = 'pbkdf2_sha256';
const HASH_ITERATIONS = 150_000;
const HASH_KEY_LENGTH = 32;
const HASH_DIGEST = 'sha256';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashAdminPassword(password: string, salt = crypto.randomBytes(16).toString('base64url')) {
  const derivedKey = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('base64url');
  return `${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${derivedKey}`;
}

export function verifyAdminPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, derivedKey] = storedHash.split('$');
  if (algorithm !== HASH_ALGORITHM || !iterationsRaw || !salt || !derivedKey) return false;

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const expectedKey = crypto.pbkdf2Sync(password, salt, iterations, HASH_KEY_LENGTH, HASH_DIGEST).toString('base64url');
  const expectedBuffer = Buffer.from(expectedKey);
  const derivedBuffer = Buffer.from(derivedKey);
  if (expectedBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

export function getBootstrapAdminCredentials(): BootstrapCredentials | null {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  const displayName = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'Bimed Administrator';
  if (!email || !password) return null;
  return { email: normalizeEmail(email), password, displayName };
}

async function createBootstrapAdmin(client: SupabaseClient, credentials: BootstrapCredentials) {
  const { data, error } = await client
    .from('recruitment_admin_users')
    .insert({
      email: credentials.email,
      password_hash: hashAdminPassword(credentials.password),
      display_name: credentials.displayName,
      role: 'admin',
      active: true,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AdminUser;
}

export async function authenticateAdminUser(client: SupabaseClient, email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const { data: adminUser, error } = await client
    .from('recruitment_admin_users')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) throw error;

  if (adminUser && adminUser.active && verifyAdminPassword(password, adminUser.password_hash)) {
    await client
      .from('recruitment_admin_users')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', adminUser.id);
    return adminUser as AdminUser;
  }

  const { data: existingAdmins, error: countError } = await client.from('recruitment_admin_users').select('id').limit(1);
  if (countError) throw countError;

  const bootstrapCredentials = getBootstrapAdminCredentials();
  if (
    existingAdmins?.length === 0 &&
    bootstrapCredentials &&
    normalizedEmail === bootstrapCredentials.email &&
    password === bootstrapCredentials.password
  ) {
    return createBootstrapAdmin(client, bootstrapCredentials);
  }

  return null;
}
