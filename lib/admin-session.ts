import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'bimed_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminSession = {
  admin_user_id: string;
  email: string;
  role: string;
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

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessionToken(admin: Pick<AdminSession, 'admin_user_id' | 'email' | 'role'>) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is required.');
  }

  const payload: AdminSession = {
    admin_user_id: admin.admin_user_id,
    email: admin.email,
    role: admin.role,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('base64url'),
  };

  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = decodePayload(encodedPayload);
    if (payload.role !== 'admin' || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getAdminSession(request: NextRequest) {
  return verifyAdminSessionToken(request.cookies.get(COOKIE_NAME)?.value);
}

export function isAdminRequestAuthenticated(request: NextRequest) {
  return Boolean(getAdminSession(request));
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
