import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { db } from './db';

export const ADMIN_SESSION_COOKIE_NAME = 'bimed_admin_session';
const COOKIE_NAME = ADMIN_SESSION_COOKIE_NAME;
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminSession = {
  admin_user_id: string;
  email: string;
  role: string;
  session_version: number;
  exp: number;
  nonce: string;
};

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function encodePayload(payload: AdminSession) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminSession;
}

function signPayload(encodedPayload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessionToken(
  admin: Pick<AdminSession, 'admin_user_id' | 'email' | 'role' | 'session_version'>,
) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is required.');

  const payload: AdminSession = {
    admin_user_id: admin.admin_user_id,
    email: admin.email,
    role: admin.role,
    session_version: admin.session_version,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('base64url'),
  };

  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  if (!safeEqual(signature, signPayload(encodedPayload, secret))) return null;

  try {
    const payload = decodePayload(encodedPayload);
    if (
      payload.role !== 'admin' ||
      payload.exp <= Date.now() ||
      !Number.isInteger(payload.session_version) ||
      payload.session_version < 1
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getAdminSessionFromToken(token: string | undefined | null) {
  const tokenSession = verifyAdminSessionToken(token);
  if (!tokenSession) return null;

  try {
    const { data: account, error } = await db()
      .from('recruitment_admin_users')
      .select('id,email,role,active,session_version')
      .eq('id', tokenSession.admin_user_id)
      .maybeSingle();

    if (error || !account || !account.active) return null;
    if (account.role !== 'admin') return null;
    if (account.email !== tokenSession.email) return null;
    if (account.session_version !== tokenSession.session_version) return null;

    return tokenSession;
  } catch {
    return null;
  }
}

export async function getAdminSession(request: NextRequest) {
  return getAdminSessionFromToken(request.cookies.get(COOKIE_NAME)?.value);
}

export async function isAdminRequestAuthenticated(request: NextRequest) {
  return Boolean(await getAdminSession(request));
}

export function setAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
