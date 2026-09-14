import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendApplicationStatusUpdateEmails } from '@/lib/email';
import { MAX_JSON_BYTES, readJsonBody, validateAdminApplicationPatch } from '@/lib/request-validation';
import { createSignedAudioUrl, INTERVIEW_AUDIO_BUCKET } from '@/lib/interview-audio';
import { createStaffAudit, createStaffFromApplication } from '@/lib/staff';
import { normalizeRecruitmentRole } from '@/lib/bimed-role-policy';
import { sendStaffPortalActivationEmail } from '@/lib/email/staff-activation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const { id: applicationId } = await context.params;
  const { data: application, error: applicationError } = await client
    .from('recruitment_applications').select('*').eq('id', applicationId).single();
  if (applicationError || !application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const { data: invite } = await client.from('recruitment_invites').select('*').eq('id', application.invite_id).maybeSingle();
  const auditQuery = client.from('recruitment_audit_log').select('*').order('created_at', { ascending: false }).limit(20);
  const { data: auditLog } = application.invite_id
    ? await auditQuery.or(`application_id.eq.${application.id},invite_id.eq.${application.invite_id}`)
    : await auditQuery.eq('application_id', application.id);

  const interviewAudioUrls: Record<string, string> = {};
  const interviewResponses = (application.interview_responses || {}) as Record<string, { audio_path?: string }>;
  for (const [questionId, answer] of Object.entries(interviewResponses)) {
    if (answer?.audio_path) {
      const url = await createSignedAudioUrl(client, answer.audio_path);
      if (url) interviewAudioUrls[questionId] = url;
    }
  }

  const canonicalRole = normalizeRecruitmentRole(application.role_applied);
  const normalizedApplication = canonicalRole
    ? { ...application, role_applied: canonicalRole }
    : application;
  const normalizedInvite = invite?.role
    ? { ...invite, role: normalizeRecruitmentRole(invite.role) ?? invite.role }
    : invite;

  return NextResponse.json({ application: normalizedApplication, invite: normalizedInvite, auditLog: auditLog || [], interviewAudioUrls });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const validation = validateAdminApplicationPatch(bodyResult.data);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { id: applicationId } = await context.params;
  const body = validation.data;
  const client = db();
  const { data: before } = await client.from('recruitment_applications').select('status').eq('id', applicationId).maybeSingle();
  const previousStatus = before?.status || null;

  let preparedStaff: { staff: any; activationToken: string | null } | null = null;

  // Hired is the hard boundary between recruitment and permanent workforce. Prepare the
  // staff identity first so an applicant cannot be left as Hired without a real Staff Portal account.
  if (body.status === 'Hired' && previousStatus !== 'Hired') {
    try {
      preparedStaff = await createStaffFromApplication(client, applicationId, { refreshActivation: true });
    } catch (staffError) {
      console.error(JSON.stringify({ level: 'error', event: 'staff.identity_creation_failed_on_hire', application_id: applicationId, reason: staffError instanceof Error ? staffError.message : 'unknown' }));
      return NextResponse.json({ error: staffError instanceof Error ? staffError.message : 'Unable to create the BIMED staff account. The candidate was not moved to Hired.' }, { status: 422 });
    }
  }

  const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body.status) updatePayload.status = body.status;
  if (body.notes !== undefined) updatePayload.admin_notes = body.notes;

  const { data, error } = await client.from('recruitment_applications')
    .update(updatePayload).eq('id', applicationId).select('*').single();
  if (!data) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  if (error) return NextResponse.json({ error: 'Unable to update application.' }, { status: 500 });

  await recordRecruitmentAudit(client, {
    applicationId,
    inviteId: data.invite_id,
    eventType: 'admin_application_updated',
    actor: session.email,
    metadata: { status: body.status || data.status, previous_status: previousStatus, notes_updated: body.notes !== undefined },
  });

  let staffIdentity: { bimed_id: string; bimed_email: string; activationUrl: string | null; welcomeEmailSent: boolean } | null = null;

  if (preparedStaff) {
    const origin = new URL(request.url).origin;
    let welcomeEmailSent = false;
    if (preparedStaff.activationToken) {
      const welcome = await sendStaffPortalActivationEmail(client, preparedStaff.staff, preparedStaff.activationToken, data.email);
      welcomeEmailSent = welcome.status === 'sent';
    }
    staffIdentity = {
      bimed_id: preparedStaff.staff.bimed_id,
      bimed_email: preparedStaff.staff.email,
      activationUrl: preparedStaff.activationToken ? `${origin}/staff/activate?token=${encodeURIComponent(preparedStaff.activationToken)}&email=${encodeURIComponent(preparedStaff.staff.email)}` : null,
      welcomeEmailSent,
    };
    await createStaffAudit(client, {
      staffId: preparedStaff.staff.id,
      actor: session.email,
      eventType: 'candidate_promoted_to_hired',
      metadata: {
        application_id: applicationId,
        recruitment_status: 'Hired',
        bimed_id: preparedStaff.staff.bimed_id,
        bimed_email: preparedStaff.staff.email,
        welcome_email_sent: welcomeEmailSent,
      },
    });
  } else if (body.status && ['Selected', 'Offer Issued', 'Onboarding'].includes(body.status)) {
    try {
      const result = await createStaffFromApplication(client, applicationId);
      const origin = new URL(request.url).origin;
      staffIdentity = {
        bimed_id: result.staff.bimed_id,
        bimed_email: result.staff.email,
        activationUrl: result.activationToken ? `${origin}/staff/activate?token=${encodeURIComponent(result.activationToken)}&email=${encodeURIComponent(result.staff.email)}` : null,
        welcomeEmailSent: false,
      };
      await createStaffAudit(client, { staffId: result.staff.id, actor: session.email, eventType: 'recruitment_status_linked_to_staff', metadata: { application_id: applicationId, recruitment_status: body.status } });
    } catch (staffError) {
      console.error(JSON.stringify({ level: 'error', event: 'staff.identity_creation_failed', application_id: applicationId, reason: staffError instanceof Error ? staffError.message : 'unknown' }));
    }
  }

  let statusEmail = null;
  if (body.status && previousStatus && body.status !== previousStatus) {
    try {
      const emails = await sendApplicationStatusUpdateEmails({
        application: data,
        previousStatus,
        status: body.status,
        actor: session.email,
        // Hired uses the personalized new-hire welcome email above rather than the generic status email.
        notifyCandidate: body.status === 'Hired' ? false : body.notify_candidate !== false,
      }, client);
      statusEmail = emails.candidate;
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'email.status_update_unhandled', application_id: applicationId, reason: emailError instanceof Error ? emailError.message : 'unknown' }));
    }
  }

  return NextResponse.json({ application: data, statusEmail, staffIdentity });
}

// Permanently deletes a candidate's application and everything tied to it (interviews, contract
// signatures, second-interview record, and any recorded voice notes). Audit log entries survive
// with application_id set to null (see 20260906_audit_log_cascade.sql), so there's still a record
// of a deletion without blocking it.
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id: applicationId } = await context.params;
  const client = db();

  const { data: application, error: fetchError } = await client
    .from('recruitment_applications')
    .select('id, full_name, email, role_applied, interview_responses')
    .eq('id', applicationId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  try {
    const audioPaths: string[] = [];
    const interviewResponses = (application.interview_responses || {}) as Record<string, { audio_path?: string }>;
    for (const answer of Object.values(interviewResponses)) {
      if (answer?.audio_path) audioPaths.push(answer.audio_path);
    }

    const { data: secondInterviews } = await client
      .from('recruitment_second_interviews')
      .select('answers')
      .eq('application_id', applicationId);
    for (const interview of secondInterviews || []) {
      for (const answer of Object.values((interview.answers || {}) as Record<string, unknown>)) {
        if (answer && typeof answer === 'object' && 'audio_path' in answer) {
          audioPaths.push((answer as { audio_path: string }).audio_path);
        }
      }
    }

    if (audioPaths.length) {
      await client.storage.from(INTERVIEW_AUDIO_BUCKET).remove(audioPaths);
    }

    await recordRecruitmentAudit(client, {
      applicationId: null,
      eventType: 'admin_application_deleted',
      actor: session.email,
      metadata: { deleted_application_id: applicationId, full_name: application.full_name, email: application.email, role_applied: application.role_applied },
    });

    const { error: deleteError } = await client.from('recruitment_applications').delete().eq('id', applicationId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'application.delete_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to delete this application right now.' }, { status: 500 });
  }
}
