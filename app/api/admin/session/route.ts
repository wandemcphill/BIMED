import { NextRequest, NextResponse } from 'next/server';
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminSession,
  revokeAdminSession,
  setAdminSessionCookie,
} from '@/lib/admin-session';
import { authenticateAdminUser } from '@/lib/admin-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { readJsonBody, validateAdminLogin } from '@/lib/input-validation';

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
        { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined }
      );
    }

    const parsed = await readJsonBody(request, 16 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const validation = validateAdminLogin(parsed.value);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const client = db();
    const admin = await authenticateAdminUser(client, validation.value.email, validation.value.password);
    if (!admin) return NextResponse.json({ error: 'Incorrect admin email or password.' }, { status: 401 });

    const response = NextResponse.json({ ok: true, email: admin.email });
    const token = await createAdminSessionToken(client, {
      admin_user_id: admin.id,
      email: admin.email,
      role: admin.role,
    });
    setAdminSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('Admin login failed', error);
    return NextResponse.json({ error: 'Unable to sign in right now.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  await revokeAdminSession(request);
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
