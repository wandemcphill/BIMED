import { describe, expect, it } from 'vitest';
import {
  buildResetUrl,
  consumeAdminPasswordReset,
  createAdminPasswordReset,
  RESET_TOKEN_TTL_MINUTES,
  validateNewPassword,
} from '@/lib/admin-password-reset';
import { verifyAdminPassword } from '@/lib/admin-auth';
import { hashToken } from '@/lib/token';
import { createFakeSupabase } from './helpers/fake-supabase';

function seedDb(overrides: Record<string, unknown> = {}) {
  return createFakeSupabase({
    recruitment_admin_users: [
      {
        id: 'admin-1',
        email: 'admin@bimedhealthcare.com',
        password_hash: 'pbkdf2_sha256$150000$salt$existing',
        display_name: 'Bimed Administrator',
        role: 'admin',
        active: true,
        ...overrides,
      },
    ],
    recruitment_admin_password_resets: [],
  });
}

describe('password policy', () => {
  it('requires at least 12 characters with a letter and a number', () => {
    expect(validateNewPassword('short1')).toEqual({ ok: false, error: expect.stringContaining('at least 12') });
    expect(validateNewPassword('alllettersonly')).toEqual({ ok: false, error: expect.stringContaining('letter and one number') });
    expect(validateNewPassword('123456789012')).toEqual({ ok: false, error: expect.stringContaining('letter and one number') });
    expect(validateNewPassword('CorrectHorse42')).toEqual({ ok: true });
  });

  it('rejects an absurdly long password', () => {
    expect(validateNewPassword('a1'.repeat(200)).ok).toBe(false);
  });
});

describe('creating a reset', () => {
  it('issues a token for an active admin and stores only its hash', async () => {
    const db = seedDb();

    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', '203.0.113.5');

    expect(reset).not.toBeNull();
    expect(reset!.admin.email).toBe('admin@bimedhealthcare.com');

    const rows = db.rows('recruitment_admin_password_resets');
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(reset!.token));
    // The plaintext token must never be persisted.
    expect(JSON.stringify(rows[0])).not.toContain(reset!.token);
  });

  it('is case-insensitive on the email address', async () => {
    const db = seedDb();
    const reset = await createAdminPasswordReset(db as never, '  ADMIN@BimedHealthcare.com ', null);
    expect(reset).not.toBeNull();
  });

  it('returns null for an unknown address without creating a token', async () => {
    const db = seedDb();

    const reset = await createAdminPasswordReset(db as never, 'nobody@example.com', null);

    expect(reset).toBeNull();
    expect(db.rows('recruitment_admin_password_resets')).toHaveLength(0);
  });

  it('returns null for a deactivated account', async () => {
    const db = seedDb({ active: false });

    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    expect(reset).toBeNull();
    expect(db.rows('recruitment_admin_password_resets')).toHaveLength(0);
  });

  it('expires within the advertised TTL', async () => {
    const db = seedDb();
    const before = Date.now();

    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    const ttlMs = RESET_TOKEN_TTL_MINUTES * 60 * 1000;
    expect(reset!.expiresAt.getTime()).toBeGreaterThan(before);
    expect(reset!.expiresAt.getTime()).toBeLessThanOrEqual(before + ttlMs + 1000);
  });

  it('retires an earlier outstanding token so only the newest link works', async () => {
    const db = seedDb();

    const first = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);
    const second = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    const firstResult = await consumeAdminPasswordReset(db as never, first!.token, 'BrandNewPass42');
    expect(firstResult).toEqual({ ok: false, reason: 'used' });

    const secondResult = await consumeAdminPasswordReset(db as never, second!.token, 'BrandNewPass42');
    expect(secondResult.ok).toBe(true);
  });
});

describe('consuming a reset', () => {
  it('sets the new password hash and marks the token used', async () => {
    const db = seedDb();
    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    const result = await consumeAdminPasswordReset(db as never, reset!.token, 'BrandNewPass42');

    expect(result).toEqual({ ok: true, adminUserId: 'admin-1', email: 'admin@bimedhealthcare.com' });

    const admin = db.rows('recruitment_admin_users')[0];
    expect(admin.password_hash).not.toBe('pbkdf2_sha256$150000$salt$existing');
    expect(verifyAdminPassword('BrandNewPass42', admin.password_hash)).toBe(true);
    expect(verifyAdminPassword('wrong-password', admin.password_hash)).toBe(false);

    expect(db.rows('recruitment_admin_password_resets')[0].used_at).toBeTruthy();
  });

  it('rejects an unknown token', async () => {
    const db = seedDb();
    expect(await consumeAdminPasswordReset(db as never, 'not-a-real-token', 'BrandNewPass42')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects an empty token', async () => {
    const db = seedDb();
    expect(await consumeAdminPasswordReset(db as never, '', 'BrandNewPass42')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token that has already been used', async () => {
    const db = seedDb();
    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    const first = await consumeAdminPasswordReset(db as never, reset!.token, 'BrandNewPass42');
    expect(first.ok).toBe(true);

    const second = await consumeAdminPasswordReset(db as never, reset!.token, 'AnotherPass99');
    expect(second).toEqual({ ok: false, reason: 'used' });

    // The second attempt must not have changed the password again.
    expect(verifyAdminPassword('BrandNewPass42', db.rows('recruitment_admin_users')[0].password_hash)).toBe(true);
  });

  it('rejects an expired token', async () => {
    const db = seedDb();
    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    db.rows('recruitment_admin_password_resets')[0].expires_at = new Date(Date.now() - 1000).toISOString();

    expect(await consumeAdminPasswordReset(db as never, reset!.token, 'BrandNewPass42')).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(verifyAdminPassword('BrandNewPass42', db.rows('recruitment_admin_users')[0].password_hash)).toBe(false);
  });

  it('rejects a token whose account was deactivated after issue', async () => {
    const db = seedDb();
    const reset = await createAdminPasswordReset(db as never, 'admin@bimedhealthcare.com', null);

    db.rows('recruitment_admin_users')[0].active = false;

    expect(await consumeAdminPasswordReset(db as never, reset!.token, 'BrandNewPass42')).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });
});

describe('reset URL', () => {
  it('uses the configured production app URL and encodes the token', () => {
    const url = buildResetUrl('abc/def+ghi=');
    expect(url.startsWith('https://recruitment.bimedhealthcare.com/admin/reset-password?token=')).toBe(true);
    expect(url).toContain(encodeURIComponent('abc/def+ghi='));
  });
});
