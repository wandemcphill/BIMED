import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { sendApplicationReceivedEmails } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { readJsonBody, validateCandidateApplication } from '@/lib/input-validation';

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({ key: 'candidate-application', limit: 12, windowMs: 60 * 60 * 1000, request: req });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions from this network. Please try again later.' },
        { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined }
      );
    }

    const parsed = await readJsonBody(req);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const tokenResult = typeof parsed.value.token === 'string'
      ? parsed.value.token.trim()
      : '';
    if (!tokenResult || tokenResult.length > 256) {
      return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });
    }

    const validation = validateCandidateApplication(parsed.value);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const client = db();
    const { data: applicationId, error: submitError } = await client.rpc('consume_and_create_recruitment_application', {
      p_token_hash: hashToken(tokenResult),
      p_payload: {
        ...validation.value,
        professional_references: validation.value.references || null,
      },
    });

    if (submitError || !applicationId) {
      const message = submitError?.message || '';
      if (message.includes('INVITE_NOT_FOUND')) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
      if (message.includes('INVITE_ALREADY_USED')) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 409 });
      if (message.includes('INVITE_EXPIRED')) return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 });
      throw submitError || new Error('Application was not created.');
    }

    const { data: application, error: applicationReadError } = await client
      .from('recruitment_applications')
      .select('*')
      .eq('id', applicationId)
      .single();
    if (applicationReadError || !application) throw applicationReadError || new Error('Created application could not be read.');

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      inviteId: application.invite_id,
      eventType: 'application_submitted',
      actor: 'candidate',
      metadata: {
        country_of_residence: application.country_of_residence,
        role_applied: application.role_applied,
        living_in_ireland: application.living_in_ireland,
      },
    });

    try {
      await sendApplicationReceivedEmails(application, client);
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'email.application_received_unhandled', application_id: application.id, reason: emailError instanceof Error ? emailError.message : 'unknown' }));
    }

    return NextResponse.json({ ok: true, id: application.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
