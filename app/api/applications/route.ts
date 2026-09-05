import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { sendApplicationReceivedEmails } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { uploadInterviewVoiceNotes } from '@/lib/interview-audio';
import { MAX_JSON_BYTES, readJsonBody, validateCandidateApplication } from '@/lib/request-validation';

// Supabase RPC errors are PostgrestError objects ({ code, message, details, hint }),
// never instances of the JS Error class, so `error instanceof Error` never matches
// them here -- every invitation-state error fell through to a generic 500 instead
// of the intended 409/410/404.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error || '');
}

export function databaseInviteError(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('INVITATION_USED')) return { error: 'This invitation has already been used.', status: 409 };
  if (message.includes('INVITATION_EXPIRED')) return { error: 'This invitation has expired.', status: 410 };
  if (message.includes('INVITATION_NOT_FOUND')) return { error: 'Invitation not found.', status: 404 };
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({ key: 'candidate-application', limit: 12, windowMs: 60 * 60 * 1000, request: req });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many submissions from this network. Please try again later.' },
        { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
      );
    }

    const bodyResult = await readJsonBody(req, MAX_JSON_BYTES.candidateApplication);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

    const validation = validateCandidateApplication(bodyResult.data);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const client = db();
    const payload = validation.data;
    const tokenHash = hashToken(String(payload.token));

    let interviewResponses = payload.interview_responses;
    if (interviewResponses && typeof interviewResponses === 'object') {
      try {
        interviewResponses = await uploadInterviewVoiceNotes(
          client,
          tokenHash,
          interviewResponses as Record<string, { text?: string; audio_base64?: string; mime_type?: string }>
        );
      } catch (uploadError) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'interview_audio.upload_failed',
          reason: uploadError instanceof Error ? uploadError.message : 'unknown',
        }));
        return NextResponse.json(
          { error: 'Unable to save a voice note answer. Please try re-recording it, or type that answer instead.' },
          { status: 500 }
        );
      }
    }

    const { data: application, error: applicationError } = await client.rpc('create_recruitment_application', {
      p_token_hash: tokenHash,
      p_payload: { ...payload, interview_responses: interviewResponses },
    });

    if (applicationError || !application) {
      const mapped = databaseInviteError(applicationError);
      if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      throw applicationError || new Error('Application creation failed.');
    }

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
      console.error(JSON.stringify({
        level: 'error',
        event: 'email.application_received_unhandled',
        application_id: application.id,
        reason: emailError instanceof Error ? emailError.message : 'unknown',
      }));
    }

    return NextResponse.json({ ok: true, id: application.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
