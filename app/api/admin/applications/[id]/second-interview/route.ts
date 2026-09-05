import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendSecondInterviewInviteEmail } from '@/lib/email';
import { createSecondInterviewRequest, listSecondInterviewsForApplication } from '@/lib/second-interview';
import { createSignedAudioUrl } from '@/lib/interview-audio';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id: applicationId } = await context.params;
  const interviews = await listSecondInterviewsForApplication(applicationId);

  const client = db();
  const audioUrlsByInterview: Record<string, Record<string, string>> = {};
  for (const interview of interviews) {
    if (!interview.answers) continue;
    const urls: Record<string, string> = {};
    for (const [questionId, answer] of Object.entries(interview.answers)) {
      if (answer && typeof answer === 'object' && 'audio_path' in answer) {
        const url = await createSignedAudioUrl(client, answer.audio_path);
        if (url) urls[questionId] = url;
      }
    }
    if (Object.keys(urls).length) audioUrlsByInterview[interview.id] = urls;
  }

  return NextResponse.json({ interviews, audioUrlsByInterview });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-second-interview', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const { id: applicationId } = await context.params;
  const client = db();

  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, role_applied')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const { record, link } = await createSecondInterviewRequest({ applicationId: application.id, sentBy: session.email });

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      eventType: 'second_interview_sent',
      actor: session.email,
      metadata: { second_interview_id: record.id },
    });

    const email = await sendSecondInterviewInviteEmail(
      {
        application,
        interviewUrl: link,
        expiresLabel: record.expires_at ? new Date(record.expires_at).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : null,
        interviewId: record.id,
      },
      client
    );

    return NextResponse.json({ interview: record, link, email });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'second_interview.create_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to send the second interview right now.' }, { status: 500 });
  }
}
