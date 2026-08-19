import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import {
  safeUrl,
  sendInterviewCancelledEmails,
  sendInterviewInvitationEmails,
  sendInterviewRescheduledEmails,
} from '@/lib/email';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_TEXT = 500;

function trimText(value: unknown, limit = MAX_TEXT): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

/** Interview times must be a real, future instant. */
function parseScheduledAt(value: unknown): { ok: true; iso: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: 'An interview date and time is required.' };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'The interview date and time is not a valid date.' };
  }

  if (parsed.getTime() < Date.now() - 60_000) {
    return { ok: false, error: 'The interview date and time must be in the future.' };
  }

  return { ok: true, iso: parsed.toISOString() };
}

function parseDuration(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(Math.round(parsed), 8 * 60);
}

async function loadApplication(client: ReturnType<typeof db>, applicationId: string) {
  const { data, error } = await client
    .from('recruitment_applications')
    .select('id, full_name, email, role_applied, status, living_in_ireland, country_of_residence, phone, work_permission, submitted_at')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { id: applicationId } = await context.params;
  const { data, error } = await db()
    .from('recruitment_interviews')
    .select('*')
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ interviews: data || [] });
}

/**
 * Schedules a new interview, moves the application to the existing "Interview" status and
 * sends the candidate invitation plus internal notifications.
 *
 * The interview record is committed before any email is attempted, and email failures are
 * reported in the response without rolling back the schedule.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({ key: 'admin-interview', limit: 60, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    const init: ResponseInit = { status: 429 };
    if (rateLimit.retryAfterSeconds) {
      init.headers = { 'Retry-After': String(rateLimit.retryAfterSeconds) };
    }
    return NextResponse.json({ error: 'Too many interview requests. Please try again later.' }, init);
  }

  const { id: applicationId } = await context.params;
  const body = await request.json().catch(() => null);

  const scheduledAt = parseScheduledAt(body?.scheduled_at);
  if (!scheduledAt.ok) {
    return NextResponse.json({ error: scheduledAt.error }, { status: 400 });
  }

  const meetingLinkRaw = trimText(body?.meeting_link);
  if (meetingLinkRaw && !safeUrl(meetingLinkRaw)) {
    return NextResponse.json({ error: 'The meeting link must be a valid http(s) URL.' }, { status: 400 });
  }

  try {
    const client = db();
    const application = await loadApplication(client, applicationId);

    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const { data: interview, error: insertError } = await client
      .from('recruitment_interviews')
      .insert({
        application_id: applicationId,
        scheduled_at: scheduledAt.iso,
        duration_minutes: parseDuration(body?.duration_minutes),
        location: trimText(body?.location),
        meeting_link: meetingLinkRaw,
        interviewer: trimText(body?.interviewer, 200),
        candidate_instructions: trimText(body?.candidate_instructions, 1000),
        status: 'Scheduled',
      })
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }

    // Keep the application status aligned with the existing recruitment vocabulary.
    if (application.status !== 'Interview') {
      await client
        .from('recruitment_applications')
        .update({ status: 'Interview', updated_at: new Date().toISOString() })
        .eq('id', applicationId);
    }

    await recordRecruitmentAudit(client, {
      applicationId,
      eventType: 'interview_scheduled',
      actor: session.email,
      metadata: { interview_id: interview.id, scheduled_at: interview.scheduled_at },
    });

    const emails = await sendInterviewInvitationEmails({ application, interview }, client);

    return NextResponse.json({ interview, email: emails.candidate });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'interview.schedule_failed',
        application_id: applicationId,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    );
    return NextResponse.json({ error: 'Unable to schedule the interview right now.' }, { status: 500 });
  }
}

/**
 * Reschedules or cancels an existing interview and notifies the candidate.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({ key: 'admin-interview', limit: 60, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    const init: ResponseInit = { status: 429 };
    if (rateLimit.retryAfterSeconds) {
      init.headers = { 'Retry-After': String(rateLimit.retryAfterSeconds) };
    }
    return NextResponse.json({ error: 'Too many interview requests. Please try again later.' }, init);
  }

  const { id: applicationId } = await context.params;
  const body = await request.json().catch(() => null);
  const interviewId = trimText(body?.interview_id, 64);
  const action = body?.action;

  if (!interviewId) {
    return NextResponse.json({ error: 'An interview id is required.' }, { status: 400 });
  }

  if (action !== 'reschedule' && action !== 'cancel') {
    return NextResponse.json({ error: 'Action must be either "reschedule" or "cancel".' }, { status: 400 });
  }

  try {
    const client = db();
    const application = await loadApplication(client, applicationId);

    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const { data: existing, error: existingError } = await client
      .from('recruitment_interviews')
      .select('*')
      .eq('id', interviewId)
      .eq('application_id', applicationId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existing) {
      return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
    }

    if (existing.status === 'Cancelled') {
      return NextResponse.json({ error: 'This interview has already been cancelled.' }, { status: 409 });
    }

    if (action === 'cancel') {
      const reason = trimText(body?.reason);
      const { data: cancelled, error: cancelError } = await client
        .from('recruitment_interviews')
        .update({
          status: 'Cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', interviewId)
        .select('*')
        .single();

      if (cancelError) {
        throw cancelError;
      }

      await recordRecruitmentAudit(client, {
        applicationId,
        eventType: 'interview_cancelled',
        actor: session.email,
        metadata: { interview_id: interviewId, had_reason: Boolean(reason) },
      });

      const emails = await sendInterviewCancelledEmails({ application, interview: cancelled, reason }, client);

      return NextResponse.json({ interview: cancelled, email: emails.candidate });
    }

    const scheduledAt = parseScheduledAt(body?.scheduled_at);
    if (!scheduledAt.ok) {
      return NextResponse.json({ error: scheduledAt.error }, { status: 400 });
    }

    const meetingLinkRaw = trimText(body?.meeting_link);
    if (meetingLinkRaw && !safeUrl(meetingLinkRaw)) {
      return NextResponse.json({ error: 'The meeting link must be a valid http(s) URL.' }, { status: 400 });
    }

    const nextRevision = (existing.reschedule_count || 0) + 1;

    const { data: rescheduled, error: rescheduleError } = await client
      .from('recruitment_interviews')
      .update({
        scheduled_at: scheduledAt.iso,
        duration_minutes: parseDuration(body?.duration_minutes) ?? existing.duration_minutes,
        location: body?.location === undefined ? existing.location : trimText(body?.location),
        meeting_link: body?.meeting_link === undefined ? existing.meeting_link : meetingLinkRaw,
        interviewer: body?.interviewer === undefined ? existing.interviewer : trimText(body?.interviewer, 200),
        candidate_instructions:
          body?.candidate_instructions === undefined ? existing.candidate_instructions : trimText(body?.candidate_instructions, 1000),
        status: 'Rescheduled',
        reschedule_count: nextRevision,
        updated_at: new Date().toISOString(),
      })
      .eq('id', interviewId)
      .select('*')
      .single();

    if (rescheduleError) {
      throw rescheduleError;
    }

    await recordRecruitmentAudit(client, {
      applicationId,
      eventType: 'interview_rescheduled',
      actor: session.email,
      metadata: {
        interview_id: interviewId,
        previous_scheduled_at: existing.scheduled_at,
        scheduled_at: rescheduled.scheduled_at,
      },
    });

    const emails = await sendInterviewRescheduledEmails(
      {
        application,
        interview: rescheduled,
        previousScheduledAt: existing.scheduled_at,
        revision: nextRevision,
      },
      client
    );

    return NextResponse.json({ interview: rescheduled, email: emails.candidate });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'interview.update_failed',
        application_id: applicationId,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    );
    return NextResponse.json({ error: 'Unable to update the interview right now.' }, { status: 500 });
  }
}
