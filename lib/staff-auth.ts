import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from './db';

export const STAFF_SESSION_COOKIE_NAME = 'bimed_staff_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ACTIVATION_TTL_SECONDS = 60 * 60 * 24 * 7;
const HASH_ALGORITHM = 'pbkdf2_sha256';
const HASH_ITERATIONS = 150_000;
const HASH_KEY_LENGTH = 32;
const HASH_DIGEST = 'sha256';

export type StaffSession = {
  staff_id: string;
  bimed_id: string;
  email: string;
  session_version: number;
  exp: number;
  nonce: string;
};

function getSessionSecret() {
  return process.env.STAFF_SESSION_SECRET?.trim() || '';
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashStaffPassword(password: string, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST).toString('base64url');
  return `${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${derived}`;
}

export function verifyStaffPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, derived] = storedHash.split('$');
  if (algorithm !== HASH_ALGORITHM || !iterationsRaw || !salt || !derived) return false;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const expected = crypto.pbkdf2Sync(password, salt, iterations, HASH_KEY_LENGTH, HASH_DIGEST).toString('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(derived);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createActivationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashActivationToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function activationExpiresAt() {
  return new Date(Date.now() + ACTIVATION_TTL_SECONDS * 1000).toISOString();
}

function encode(payload: StaffSession) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as StaffSession;
}

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createStaffSessionToken(staff: Pick<StaffSession, 'staff_id' | 'bimed_id' | 'email' | 'session_version'>) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('STAFF_SESSION_SECRET is required.');
  const payload: StaffSession = {
    staff_id: staff.staff_id,
    bimed_id: staff.bimed_id,
    email: normalizeEmail(staff.email),
    session_version: staff.session_version,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('base64url'),
  };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyStaffSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(signature, sign(encoded, secret))) return null;
  try {
    const payload = decode(encoded);
    if (!payload.staff_id || !payload.bimed_id || !payload.email || payload.exp <= Date.now() || payload.session_version < 1) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getStaffSessionFromToken(token: string | undefined | null, client?: SupabaseClient) {
  const tokenSession = verifyStaffSessionToken(token);
  if (!tokenSession) return null;
  try {
    const { data: staff, error } = await (client || db())
      .from('recruitment_staff')
      .select('id,bimed_id,email,status,session_version')
      .eq('id', tokenSession.staff_id)
      .maybeSingle();
    if (error || !staff) return null;
    if (!['active', 'pre_arrival', 'on_leave'].includes(staff.status)) return null;
    if (staff.session_version !== tokenSession.session_version) return null;
    if (staff.bimed_id !== tokenSession.bimed_id || normalizeEmail(staff.email) !== tokenSession.email) return null;
    return tokenSession;
  } catch {
    return null;
  }
}

export async function getStaffSession(request: NextRequest) {
  return getStaffSessionFromToken(request.cookies.get(STAFF_SESSION_COOKIE_NAME)?.value);
}

export function setStaffSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(STAFF_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearStaffSessionCookie(response: NextResponse) {
  response.cookies.set(STAFF_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
