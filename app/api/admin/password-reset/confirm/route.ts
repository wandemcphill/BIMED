import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { consumeAdminPasswordReset, validateNewPassword } from '@/lib/admin-password-reset';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { readJsonBody, validatePasswordResetConfirm } from '@/lib/input-validation';

const REJECTION_MESSAGES: Record<string, string> = {
  invalid: 'This reset link is not valid. Please request a new one.',
  expired: 'This reset link has expired. Please request a new one.',
  used: 'This reset link has already been used. Please request a new one.',
  inactive: 'This admin account is not active. Contact the Bimed administration team.',
};

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({ key: 'admin-password-reset-confirm', limit: 10, windowMs: 60 * 60 * 1000, request });
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined });

    const parsed = await readJsonBody(request, 16 * 1024);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const validation = validatePasswordResetConfirm(parsed.value);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const passwordValidation = validateNewPassword(validation.value.password);
    if (!passwordValidation.ok) return NextResponse.json({ error: passwordValidation.error }, { status: 400 });

    const result = await consumeAdminPasswordReset(db(), validation.value.token, validation.value.password);
    if (!result.ok) return NextResponse.json({ error: REJECTION_MESSAGES[result.reason] }, { status: 400 });

    await recordRecruitmentAudit(db(), { eventType: 'admin_password_reset_completed', actor: 'admin', metadata: { admin_user_id: result.adminUserId } });
    return NextResponse.json({ ok: true, message: 'Your password has been updated. You can now sign in.' });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'admin_password_reset.confirm_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to reset your password right now.' }, { status: 500 });
  }
}
