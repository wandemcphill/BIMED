import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendSecondInterviewCompletedEmails } from '@/lib/email';
import { completeSecondInterview, getSecondInterviewByToken, type SecondInterviewAnswer } from '@/lib/second-interview';
import { uploadVoiceNote } from '@/lib/interview-audio';
import { SECOND_INTERVIEW_ALL_QUESTIONS } from '@/lib/interview-questions';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ token: string }> };
// Permissive by design: which subset of these applies to a given candidate is decided by the
// public page (based on their role), not enforced here - this allowlist just guards against
// arbitrary keys.
const SECOND_INTERVIEW_QUESTION_IDS = new Set(SECOND_INTERVIEW_ALL_QUESTIONS.map((q) => q.id));

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit({ key: 'second-interview-submit', limit: 10, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.candidateApplication);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  const rawAnswers = bodyResult.data.answers;
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return NextResponse.json({ error: 'answers must be an object.' }, { status: 400 });
  }

  const { token } = await context.params;

  try {
    const interview = await getSecondInterviewByToken(token);
    if (!interview) return NextResponse.json({ error: 'Interview link not found.' }, { status: 404 });
    if (interview.status === 'completed') return NextResponse.json({ error: 'This interview has already been completed.' }, { status: 409 });
    if (interview.expires_at && new Date(interview.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This interview link has expired. Ask Bimed to issue a new one.' }, { status: 410 });
    }

    const client = db();
    const answers: Record<string, SecondInterviewAnswer> = {};

    for (const [questionId, raw] of Object.entries(rawAnswers as Record<string, unknown>)) {
      if (!SECOND_INTERVIEW_QUESTION_IDS.has(questionId)) {
        return NextResponse.json({ error: `Unknown question: ${questionId}` }, { status: 400 });
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return NextResponse.json({ error: `answers.${questionId} is invalid.` }, { status: 400 });
      }
      const answer = raw as Record<string, unknown>;

      if (typeof answer.audio_base64 === 'string' && typeof answer.mime_type === 'string') {
        if (answer.audio_base64.length > 4_000_000 || !answer.mime_type.startsWith('audio/')) {
          return NextResponse.json({ error: `answers.${questionId} audio is invalid.` }, { status: 400 });
        }
        const path = await uploadVoiceNote(client, `second/${interview.id}`, questionId, answer.audio_base64, answer.mime_type);
        answers[questionId] = { audio_path: path, mime_type: answer.mime_type };
      } else if (typeof answer.text === 'string') {
        if (answer.text.length > 4000) return NextResponse.json({ error: `answers.${questionId} is too long.` }, { status: 400 });
        answers[questionId] = answer.text.trim();
      } else {
        return NextResponse.json({ error: `answers.${questionId} is invalid.` }, { status: 400 });
      }
    }

    const updated = await completeSecondInterview(interview.id, answers);
    if (!updated) return NextResponse.json({ error: 'This interview has already been completed.' }, { status: 409 });

    const { data: application } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, role_applied')
      .eq('id', updated.application_id)
      .maybeSingle();

    await recordRecruitmentAudit(client, {
      applicationId: updated.application_id,
      eventType: 'second_interview_completed',
      actor: application?.full_name || 'candidate',
      metadata: { second_interview_id: updated.id },
    });

    if (application) {
      await sendSecondInterviewCompletedEmails({ application, interviewId: updated.id }, client);
    }

    return NextResponse.json({ interview: updated });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'second_interview.complete_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to submit your answers right now.' }, { status: 500 });
  }
}
