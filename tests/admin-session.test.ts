import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from './helpers/fake-supabase';

/**
 * Admin sessions are revocable: the signed cookie carries a session_version, and every
 * request re-reads the live admin record so a stolen or stale cookie stops working the
 * moment the account is deactivated, demoted, renamed, or its session_version moves.
 */

let currentDb: FakeSupabase;

vi.mock('@/lib/db', () => ({
  db: () => currentDb,
}));

const { createAdminSessionToken, verifyAdminSessionToken, getAdminSession } = await import('@/lib/admin-session');

const SECRET = 'test-admin-session-secret-value';
const COOKIE_NAME = 'bimed_admin_session';
const LIVE_ADMIN = {
  id: 'admin-1',
  email: 'admin@bimedhealthcare.com',
  password_hash: 'pbkdf2_sha256$150000$salt$hash',
  display_name: 'Bimed Administrator',
  role: 'admin',
  active: true,
  session_version: 1,
};

function requestWithToken(token: string | undefined, pathname = '/api/admin/session') {
  return {
    cookies: { get: (name: string) => (name === COOKIE_NAME && token ? { value: token } : undefined) },
    nextUrl: { pathname },
  } as never;
}

function seed(overrides: Partial<typeof LIVE_ADMIN> = {}) {
  currentDb = createFakeSupabase({
    recruitment_admin_users: [{ ...LIVE_ADMIN, ...overrides }],
  });
}

function validToken(overrides: Partial<Parameters<typeof createAdminSessionToken>[0]> = {}) {
  return createAdminSessionToken({
    admin_user_id: LIVE_ADMIN.id,
    email: LIVE_ADMIN.email,
    role: 'admin',
    session_version: LIVE_ADMIN.session_version,
    ...overrides,
  });
}

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  seed();
});

describe('session token signing', () => {
  it('round-trips a session it just issued', () => {
    const session = verifyAdminSessionToken(validToken());

    expect(session).not.toBeNull();
    expect(session!.email).toBe(LIVE_ADMIN.email);
    expect(session!.session_version).toBe(1);
    expect(session!.exp).toBeGreaterThan(Date.now());
  });

  it('issues a distinct nonce per session so two tokens are never identical', () => {
    expect(validToken()).not.toBe(validToken());
  });

  it('rejects a token whose payload was edited', () => {
    const [payload, signature] = validToken().split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.session_version = 99;
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    expect(verifyAdminSessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects a token whose signature was swapped', () => {
    const [payload] = validToken().split('.');
    expect(verifyAdminSessionToken(`${payload}.not-a-real-signature`)).toBeNull();
  });

  it('rejects a malformed or empty token', () => {
    expect(verifyAdminSessionToken(undefined)).toBeNull();
    expect(verifyAdminSessionToken('')).toBeNull();
    expect(verifyAdminSessionToken('no-dot-separator')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = validToken();
    const originalNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(originalNow() + 13 * 60 * 60 * 1000);
    expect(verifyAdminSessionToken(token)).toBeNull();
    vi.restoreAllMocks();
  });

  it('rejects a token whose role is not known to the admin permission model', () => {
    expect(verifyAdminSessionToken(validToken({ role: 'viewer' }))).toBeNull();
  });

  it('accepts a known future delegated role at token-validation time', () => {
    expect(verifyAdminSessionToken(validToken({ role: 'finance' }))).not.toBeNull();
  });

  it('rejects a token carrying a nonsensical session_version', () => {
    expect(verifyAdminSessionToken(validToken({ session_version: 0 }))).toBeNull();
    expect(verifyAdminSessionToken(validToken({ session_version: 1.5 }))).toBeNull();
  });

  it('refuses to issue a token when no secret is configured', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => validToken()).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it('verifies nothing when no secret is configured', () => {
    const token = validToken();
    delete process.env.ADMIN_SESSION_SECRET;
    expect(verifyAdminSessionToken(token)).toBeNull();
  });
});

describe('revocation and RBAC against the live admin record', () => {
  it('accepts a session whose token still matches the stored account', async () => {
    const session = await getAdminSession(requestWithToken(validToken()));
    expect(session).not.toBeNull();
    expect(session!.admin_user_id).toBe(LIVE_ADMIN.id);
  });

  it('rejects the previous session once session_version is incremented', async () => {
    const token = validToken();
    expect(await getAdminSession(requestWithToken(token))).not.toBeNull();
    seed({ session_version: 2 });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects a session for a deactivated admin', async () => {
    const token = validToken();
    seed({ active: false });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects a token/account role mismatch', async () => {
    const token = validToken({ role: 'finance' });
    seed({ role: 'admin' });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects a session for an account with an unknown role', async () => {
    const token = validToken();
    seed({ role: 'viewer' });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects a session whose email no longer matches the stored account', async () => {
    const token = validToken();
    seed({ email: 'someone-else@bimedhealthcare.com' });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects a session whose admin record no longer exists', async () => {
    const token = validToken();
    currentDb = createFakeSupabase({ recruitment_admin_users: [] });
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('rejects the request when there is no session cookie at all', async () => {
    expect(await getAdminSession(requestWithToken(undefined))).toBeNull();
  });

  it('fails closed when the database lookup throws', async () => {
    const token = validToken();
    currentDb = {
      from() {
        throw new Error('connection reset');
      },
    } as never;
    expect(await getAdminSession(requestWithToken(token))).toBeNull();
  });

  it('allows finance to reach payroll but not international permit routes', async () => {
    seed({ role: 'finance' });
    const financeToken = validToken({ role: 'finance' });
    expect(await getAdminSession(requestWithToken(financeToken, '/api/admin/payslips'))).not.toBeNull();
    expect(await getAdminSession(requestWithToken(financeToken, '/api/admin/permit'))).toBeNull();
  });

  it('allows international recruitment to manage permits and recruitment, but not payroll', async () => {
    seed({ role: 'international_recruitment' });
    const token = validToken({ role: 'international_recruitment' });
    expect(await getAdminSession(requestWithToken(token, '/api/admin/permit'))).not.toBeNull();
    expect(await getAdminSession(requestWithToken(token, '/api/admin/applications/123'))).not.toBeNull();
    expect(await getAdminSession(requestWithToken(token, '/api/admin/payslips'))).toBeNull();
  });

  it('fails closed for unknown admin API routes for delegated roles', async () => {
    seed({ role: 'operations' });
    const token = validToken({ role: 'operations' });
    expect(await getAdminSession(requestWithToken(token, '/api/admin/something-new'))).toBeNull();
  });
});
