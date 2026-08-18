import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'bimed_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  exp: number;
  nonce: string;
  role: 'admin';
};

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
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

export function createAdminSessionToken() {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error('ADMIN_PASSWORD or ADMIN_SESSION_SECRET is required.');
  }

  const payload: SessionPayload = {
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('base64url'),
    role: 'admin',
  };

  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) {
    return false;
  }

  const secret = getSessionSecret();
  if (!secret) {
    return false;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = decodePayload(encodedPayload);
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function isAdminRequestAuthenticated(request: NextRequest) {
  return verifyAdminSessionToken(request.cookies.get(COOKIE_NAME)?.value);
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
