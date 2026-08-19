import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildResetUrl, createAdminPasswordReset, RESET_TOKEN_TTL_MINUTES } from '@/lib/admin-password-reset';
import { sendAdminPasswordResetEmail } from '@/lib/email';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';

/**
 * Requests an admin password reset.
 *
 * Always answers with the same 200 body whether or not the address belongs to an account,
 * so this endpoint cannot be used to enumerate admin users. The reset token is never
 * logged or returned in the response — it only ever appears in the outbound email.
 */
export async function POST(request: NextRequest) {
  const genericResponse = NextResponse.json({
    ok: true,
    message: 'If that email address belongs to a Bimed admin account, a reset link is on its way.',
  });

  try {
    const rateLimit = await checkRateLimit({
      key: 'admin-password-reset',
      limit: 5,
      windowMs: 60 * 60 * 1000,
      request,
    });

    if (!rateLimit.allowed) {
      const init: ResponseInit = { status: 429 };
      if (rateLimit.retryAfterSeconds) {
        init.headers = { 'Retry-After': String(rateLimit.retryAfterSeconds) };
      }

      return NextResponse.json({ error: 'Too many reset requests. Please try again later.' }, init);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email : '';

    if (!email.trim()) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const client = db();
    const requestedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const reset = await createAdminPasswordReset(client, email, requestedIp);

    if (!reset) {
      // Unknown or deactivated account: respond identically, send nothing.
      return genericResponse;
    }

    await sendAdminPasswordResetEmail(
      {
        to: reset.admin.email,
        displayName: reset.admin.display_name || 'there',
        resetUrl: buildResetUrl(reset.token),
        expiryMinutes: RESET_TOKEN_TTL_MINUTES,
      },
      client
    );

    await recordRecruitmentAudit(client, {
      eventType: 'admin_password_reset_requested',
      actor: 'admin',
      metadata: {
        admin_user_id: reset.admin.id,
        expires_at: reset.expiresAt.toISOString(),
      },
    });

    return genericResponse;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'admin_password_reset.request_failed',
        reason: error instanceof Error ? error.message : 'unknown',
      })
    );

    // Still generic: an internal fault must not reveal whether the account exists.
    return genericResponse;
  }
}
