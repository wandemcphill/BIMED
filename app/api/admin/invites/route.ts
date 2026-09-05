import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSession } from '@/lib/admin-session';
import { createAndSendInvite } from '@/lib/recruitment-invites';
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

  try {
    const { invite, link, email } = await createAndSendInvite(validation.data, session.email);
    return NextResponse.json({ invite, link, email });
  } catch {
    return NextResponse.json({ error: 'Unable to create invitation.' }, { status: 500 });
  }
}
