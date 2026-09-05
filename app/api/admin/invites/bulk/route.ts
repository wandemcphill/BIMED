import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSession } from '@/lib/admin-session';
import { createAndSendInvite } from '@/lib/recruitment-invites';
import { MAX_JSON_BYTES, readJsonBody, validateAdminInvite } from '@/lib/request-validation';

const MAX_BATCH_SIZE = 25;

type BatchResult = { email: string; status: 'sent' | 'skipped' | 'error'; error?: string };

// Processes one chunk of a bulk invite import. The admin dashboard calls this repeatedly with
// slices of a larger candidate list (client-side chunking), which is what makes sending
// thousands of invites practical without hitting a request timeout or the email provider's
// burst limits in one call.
export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-invite-bulk', limit: 2000, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many bulk invitation requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.candidateApplication);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  const candidates = bodyResult.data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: 'candidates must be a non-empty array.' }, { status: 400 });
  }
  if (candidates.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Send at most ${MAX_BATCH_SIZE} candidates per batch.` }, { status: 400 });
  }

  const results: BatchResult[] = [];

  for (const raw of candidates) {
    const emailHint = typeof raw === 'object' && raw && typeof (raw as Record<string, unknown>).email === 'string'
      ? ((raw as Record<string, unknown>).email as string)
      : 'unknown';

    const validation = validateAdminInvite(raw);
    if (!validation.ok) {
      results.push({ email: emailHint, status: 'error', error: validation.error });
      continue;
    }

    try {
      await createAndSendInvite(validation.data, session.email);
      results.push({ email: validation.data.email, status: 'sent' });
    } catch (error) {
      results.push({ email: validation.data.email, status: 'error', error: error instanceof Error ? error.message : 'Unable to create invitation.' });
    }
  }

  return NextResponse.json({ results });
}
