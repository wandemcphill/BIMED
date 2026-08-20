import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildResetUrl, createAdminPasswordReset, RESET_TOKEN_TTL_MINUTES } from '@/lib/admin-password-reset';
import { sendAdminPasswordResetEmail } from '@/lib/email';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

export async function POST(request: NextRequest) {
  const genericResponse = NextResponse.json({ ok: true, message: 'If that email address belongs to a Bimed admin account, a reset link is on its way.' });

  try {
    const rateLimit = await checkRateLimit({ key: 'admin-password-reset', limit: 5, windowMs: 60 * 60 * 1000, request });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many reset requests. Please try again later.' }, { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined });
    }

    const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
    const email = typeof bodyResult.data === 'object' && bodyResult.data && !Array.isArray(bodyResult.data)
      ? (bodyResult.data as Record<string, unknown>).email
      : null;
    if (typeof email !== 'string' || !email.trim()) return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });

    const client = db();
    const requestedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const reset = await createAdminPasswordReset(client, email, requestedIp);
    if (!reset) return genericResponse;

    await sendAdminPasswordResetEmail({ to: reset.admin.email, displayName: reset.admin.display_name || 'there', resetUrl: buildResetUrl(reset.token), expiryMinutes: RESET_TOKEN_TTL_MINUTES }, client);
    await recordRecruitmentAudit(client, { eventType: 'admin_password_reset_requested', actor: 'admin', metadata: { admin_user_id: reset.admin.id, expires_at: reset.expiresAt.toISOString() } });
    return genericResponse;
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin_password_reset.request_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return genericResponse;
  }
}
