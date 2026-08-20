import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSession } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { MAX_JSON_BYTES, readJsonBody, validateAdminInvite } from '@/lib/request-validation';

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-invite', limit: 20, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many invitation requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  const validation = validateAdminInvite(bodyResult.data);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { email, name, role, expiryDate } = validation.data;
  const token = makeToken();
  const client = db();
  const { data, error } = await client.from('recruitment_invites').insert({
    token_hash: hashToken(token),
    candidate_email: email,
    candidate_name: name,
    role,
    expires_at: expiryDate,
  }).select('*').single();

  if (error) return NextResponse.json({ error: 'Unable to create invitation.' }, { status: 500 });

  await recordRecruitmentAudit(client, {
    inviteId: data.id,
    eventType: 'invite_created',
    actor: session.email,
    metadata: { candidate_email: email, role, expires_at: expiryDate },
  });

  return NextResponse.json({
    invite: data,
    link: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/apply/${token}`,
  });
}
