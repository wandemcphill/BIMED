import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/db';

const COOKIE_NAME = 'bimed_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AdminSession = {
  admin_user_id: string;
  email: string;
  role: string;
  exp: number;
  nonce: string;
  sid: string;
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

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type VerifiedAdminSession = AdminSession & {
  display_name?: string | null;
};

export async function createAdminSessionToken(client: SupabaseClient, admin: Pick<AdminSession, 'admin_user_id' | 'email' | 'role'>) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is required.');

  const payload: AdminSession = {
    admin_user_id: admin.admin_user_id,
    email: admin.email,
    role: admin.role,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('base64url'),
    sid: crypto.randomUUID(),
  };

  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;

  const { error } = await client.from('recruitment_admin_sessions').insert({
    id: payload.sid,
    admin_user_id: payload.admin_user_id,
    token_hash: tokenHash(token),
    expires_at: new Date(payload.exp).toISOString(),
  });

  if (error) throw error;
  return token;
}

async function verifyAdminSessionToken(token: string | undefined | null, client: SupabaseClient): Promise<VerifiedAdminSession | null> {
  if (!token) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = decodePayload(encodedPayload);
    if (payload.role !== 'admin' || payload.exp <= Date.now() || !payload.sid) return null;

    const { data: session } = await client
      .from('recruitment_admin_sessions')
      .select('id, admin_user_id, expires_at, revoked_at')
      .eq('id', payload.sid)
      .eq('token_hash', tokenHash(token))
      .maybeSingle();

    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

    const { data: admin } = await client
      .from('recruitment_admin_users')
      .select('id, email, role, active, display_name')
      .eq('id', session.admin_user_id)
      .maybeSingle();

    if (!admin || !admin.active || admin.role !== 'admin') return null;

    await client.from('recruitment_admin_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', payload.sid);

    return { ...payload, email: admin.email, role: admin.role, display_name: admin.display_name };
  } catch {
    return null;
  }
}

export async function getAdminSession(request: NextRequest) {
  return verifyAdminSessionToken(request.cookies.get(COOKIE_NAME)?.value, db());
}

export async function isAdminRequestAuthenticated(request: NextRequest) {
  return Boolean(await getAdminSession(request));
}

export async function revokeAdminSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const [encodedPayload] = token.split('.');
      if (encodedPayload) {
        const payload = decodePayload(encodedPayload);
        if (payload.sid) await db().from('recruitment_admin_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', payload.sid);
      }
    } catch {
      // Cookie clearing below remains the fallback when the session record is unavailable.
    }
  }
}

export function setAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });
}
