import { NextRequest, NextResponse } from 'next/server';
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  isAdminRequestAuthenticated,
  setAdminSessionCookie,
} from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isAdminRequestAuthenticated(request) });
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
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

  if (!body.password || body.password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect admin password.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const token = createAdminSessionToken();
  setAdminSessionCookie(response, token);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}
