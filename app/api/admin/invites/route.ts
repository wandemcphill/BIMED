import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { checkRateLimit } from '@/lib/rate-limit';
import { isAdminRequestAuthenticated } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';

export async function POST(request: NextRequest) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    key: 'admin-invite',
    limit: 20,
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

    return NextResponse.json({ error: 'Too many invitation requests. Please try again later.' }, init);
  }

  const body = await request.json();

  if (!body.email) {
    return NextResponse.json({ error: 'Candidate email is required.' }, { status: 400 });
  }

  const token = makeToken();
  const client = db();
  const { data, error } = await client
    .from('recruitment_invites')
    .insert({
      token_hash: hashToken(token),
      candidate_email: body.email,
      candidate_name: body.name || null,
      role: body.role || null,
      expires_at: body.expiryDate || null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordRecruitmentAudit(client, {
    inviteId: data.id,
    eventType: 'invite_created',
    actor: 'admin',
    metadata: {
      candidate_email: body.email,
      role: body.role || null,
      expires_at: body.expiryDate || null,
    },
  });

  return NextResponse.json({
    invite: data,
    link: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/apply/${token}`,
  });
}
