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

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    email: session?.email || null,
    admin_user_id: session?.admin_user_id || null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({
      key: 'admin-session',
      limit: 8,
      windowMs: 60 * 60 * 1000,
      request,
    });

    if (!rateLimit.allowed) {
      const init: ResponseInit = { status: 429 };
      if (rateLimit.retryAfterSeconds) {
        init.headers = {
          'Retry-After': String(rateLimit.retryAfterSeconds),
        };
      }

      return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, init);
    }

    const body = await request.json();

    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Admin email and password are required.' }, { status: 400 });
    }

    const admin = await authenticateAdminUser(db(), body.email, body.password);

    if (!admin) {
      return NextResponse.json({ error: 'Incorrect admin email or password.' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, email: admin.email });
    const token = createAdminSessionToken({
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

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
