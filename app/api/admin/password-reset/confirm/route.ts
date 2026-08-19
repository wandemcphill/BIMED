import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { consumeAdminPasswordReset, validateNewPassword } from '@/lib/admin-password-reset';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';

const REJECTION_MESSAGES: Record<string, string> = {
  invalid: 'This reset link is not valid. Please request a new one.',
  expired: 'This reset link has expired. Please request a new one.',
  used: 'This reset link has already been used. Please request a new one.',
  inactive: 'This admin account is not active. Contact the Bimed administration team.',
};

/**
 * Completes a password reset. The token is single-use and short-lived; it is never logged.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({
      key: 'admin-password-reset-confirm',
      limit: 10,
      windowMs: 60 * 60 * 1000,
      request,
    });

    if (!rateLimit.allowed) {
      const init: ResponseInit = { status: 429 };
      if (rateLimit.retryAfterSeconds) {
        init.headers = { 'Retry-After': String(rateLimit.retryAfterSeconds) };
      }

      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, init);
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token) {
      return NextResponse.json({ error: REJECTION_MESSAGES.invalid }, { status: 400 });
    }

    const validation = validateNewPassword(password);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const client = db();
    const result = await consumeAdminPasswordReset(client, token, password);

    if (!result.ok) {
      return NextResponse.json({ error: REJECTION_MESSAGES[result.reason] }, { status: 400 });
    }

    await recordRecruitmentAudit(client, {
      eventType: 'admin_password_reset_completed',
      actor: 'admin',
      metadata: { admin_user_id: result.adminUserId },
    });

    return NextResponse.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'admin_password_reset.confirm_failed',
        reason: error instanceof Error ? error.message : 'unknown',
      })
    );

    return NextResponse.json({ error: 'Unable to reset your password right now.' }, { status: 500 });
  }
}
