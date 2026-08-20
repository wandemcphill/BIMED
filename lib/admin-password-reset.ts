/**
 * Password recovery for the portal's own admin accounts (recruitment_admin_users).
 * This project does not use Supabase Auth; Supabase is used purely as Postgres.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashAdminPassword } from './admin-auth';
import { hashToken, makeToken } from './token';

export const RESET_TOKEN_TTL_MINUTES = 30;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

type AdminUserRow = { id: string; email: string; display_name: string | null; active: boolean };

export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }

export function validateNewPassword(password: string): { ok: true } | { ok: false; error: string } {
  if (typeof password !== 'string' || password.length < MIN_ADMIN_PASSWORD_LENGTH) return { ok: false, error: `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.` };
  if (password.length > 200) return { ok: false, error: 'Password must be 200 characters or fewer.' };
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return { ok: false, error: 'Password must include at least one letter and one number.' };
  return { ok: true };
}

export async function createAdminPasswordReset(client: SupabaseClient, email: string, requestedIp?: string | null): Promise<{ token: string; admin: AdminUserRow; expiresAt: Date } | null> {
  const normalizedEmail = normalizeEmail(email);
  const { data: admin, error } = await client.from('recruitment_admin_users').select('id, email, display_name, active').eq('email', normalizedEmail).maybeSingle();
  if (error) throw error;
  if (!admin || !admin.active) return null;

  await client.from('recruitment_admin_password_resets').update({ used_at: new Date().toISOString() }).eq('admin_user_id', admin.id).is('used_at', null);

  const token = makeToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  const { error: insertError } = await client.from('recruitment_admin_password_resets').insert({
    admin_user_id: admin.id,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
    requested_ip: requestedIp || null,
  });
  if (insertError) throw insertError;
  return { token, admin: admin as AdminUserRow, expiresAt };
}

export type ResetConsumeResult =
  | { ok: true; adminUserId: string; email: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'inactive' };

export async function consumeAdminPasswordReset(client: SupabaseClient, token: string, newPassword: string): Promise<ResetConsumeResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'invalid' };

  const { data: resetRow, error } = await client.from('recruitment_admin_password_resets').select('id, admin_user_id, expires_at, used_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (error) throw error;
  if (!resetRow) return { ok: false, reason: 'invalid' };
  if (resetRow.used_at) return { ok: false, reason: 'used' };
  if (new Date(resetRow.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const { data: admin, error: adminError } = await client.from('recruitment_admin_users').select('id, email, active').eq('id', resetRow.admin_user_id).maybeSingle();
  if (adminError) throw adminError;
  if (!admin || !admin.active) return { ok: false, reason: 'inactive' };

  const { data: claimed, error: claimError } = await client.from('recruitment_admin_password_resets')
    .update({ used_at: new Date().toISOString() }).eq('id', resetRow.id).is('used_at', null).select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return { ok: false, reason: 'used' };

  const { error: updateError } = await client.from('recruitment_admin_users').update({
    password_hash: hashAdminPassword(newPassword),
    session_version: (undefined),
    updated_at: new Date().toISOString(),
  }).eq('id', admin.id);
  if (updateError) throw updateError;

  // Increment session_version in a second conditional update so every existing session is revoked.
  const { data: currentAccount, error: accountError } = await client.from('recruitment_admin_users').select('session_version').eq('id', admin.id).maybeSingle();
  if (accountError || !currentAccount) throw accountError || new Error('Admin account not found after password reset.');
  const { error: bumpError } = await client.from('recruitment_admin_users')
    .update({ session_version: Math.max(1, Number(currentAccount.session_version || 1) + 1), updated_at: new Date().toISOString() })
    .eq('id', admin.id);
  if (bumpError) throw bumpError;

  return { ok: true, adminUserId: admin.id, email: admin.email };
}

export function buildResetUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/admin/reset-password?token=${encodeURIComponent(token)}`;
}
