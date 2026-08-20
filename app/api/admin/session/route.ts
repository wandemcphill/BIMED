import { NextRequest, NextResponse } from 'next/server';
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminSession,
  setAdminSessionCookie,
} from '@/lib/admin-session';
import { authenticateAdminUser } from '@/lib/admin-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { MAX_JSON_BYTES, readJsonBody, validateAdminLogin } from '@/lib/request-validation';

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    email: session?.email || null,
    admin_user_id: session?.admin_user_id || null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({ key: 'admin-session', limit: 8, windowMs: 60 * 60 * 1000, request });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
      );
    }

    const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

    const validation = validateAdminLogin(bodyResult.data);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const admin = await authenticateAdminUser(db(), validation.data.email, validation.data.password);
    if (!admin) return NextResponse.json({ error: 'Incorrect admin email or password.' }, { status: 401 });

    const response = NextResponse.json({ ok: true, email: admin.email });
    const token = createAdminSessionToken({
      admin_user_id: admin.id,
      email: admin.email,
      role: admin.role,
      session_version: admin.session_version,
    });
    setAdminSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('Admin login failed', error);
    return NextResponse.json({ error: 'Unable to sign in right now.' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
