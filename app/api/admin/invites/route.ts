import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limit';
import { isAdminRequestAuthenticated } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { readJsonBody, validateInvite } from '@/lib/input-validation';

export async function POST(request: NextRequest) {
  if (!(await isAdminRequestAuthenticated(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-invite', limit: 20, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many invitation requests. Please try again later.' }, {
      status: 429,
      headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = await readJsonBody(request, 16 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const validation = validateInvite(parsed.value);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const token = makeToken();
  const client = db();
  const { data, error } = await client.from('recruitment_invites').insert({
    token_hash: hashToken(token),
    candidate_email: validation.value.email,
    candidate_name: validation.value.name,
    role: validation.value.role,
    expires_at: validation.value.expiryDate ? `${validation.value.expiryDate}T23:59:59.999Z` : null,
  }).select('*').single();

  if (error) return NextResponse.json({ error: 'Unable to create invitation.' }, { status: 500 });

  await recordRecruitmentAudit(client, {
    inviteId: data.id,
    eventType: 'invite_created',
    actor: 'admin',
    metadata: { role: validation.value.role, expires_at: validation.value.expiryDate || null },
  });

  return NextResponse.json({
    invite: data,
    link: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/apply/${token}`,
  });
}
