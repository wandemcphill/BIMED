import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recruitmentStatuses } from '@/lib/recruitment-config';
import { getAdminSession, isAdminRequestAuthenticated } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendApplicationStatusUpdateEmails } from '@/lib/email';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const client = db();
  const { id: applicationId } = await context.params;
  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('*')
    .eq('id', applicationId)
    .single();

  if (applicationError || !application) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const { data: invite } = await client
    .from('recruitment_invites')
    .select('*')
    .eq('id', application.invite_id)
    .maybeSingle();

  const auditQuery = client.from('recruitment_audit_log').select('*').order('created_at', { ascending: false }).limit(20);
  const { data: auditLog } = application.invite_id
    ? await auditQuery.or(`application_id.eq.${application.id},invite_id.eq.${application.invite_id}`)
    : await auditQuery.eq('application_id', application.id);

  return NextResponse.json({ application, invite, auditLog: auditLog || [] });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const body = await request.json();
  const { id: applicationId } = await context.params;

  if (body.status && !recruitmentStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
  }

  const client = db();

  // Read the current status first so a status email is only sent on an actual change.
  const { data: before } = await client
    .from('recruitment_applications')
    .select('status')
    .eq('id', applicationId)
    .maybeSingle();

  const previousStatus = before?.status || null;

  const updatePayload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) {
    updatePayload.status = body.status;
  }

  if (typeof body.notes === 'string') {
    updatePayload.admin_notes = body.notes;
  }

  const { data, error } = await client
    .from('recruitment_applications')
    .update(updatePayload)
    .eq('id', applicationId)
    .select('*')
    .single();

  if (!data) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordRecruitmentAudit(client, {
    applicationId,
    inviteId: data.invite_id,
    eventType: 'admin_application_updated',
    actor: session.email,
    metadata: {
      status: body.status || data.status,
      previous_status: previousStatus,
      notes_updated: typeof body.notes === 'string',
    },
  });

  // Notify only on a real status transition. The record is already saved, so an email
  // problem is logged by the email service and never fails this request.
  let statusEmail = null;
  if (body.status && previousStatus && body.status !== previousStatus) {
    try {
      const emails = await sendApplicationStatusUpdateEmails(
        {
          application: data,
          previousStatus,
          status: body.status,
          actor: session.email,
          notifyCandidate: body.notify_candidate !== false,
        },
        client
      );
      statusEmail = emails.candidate;
    } catch (emailError) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'email.status_update_unhandled',
          application_id: applicationId,
          reason: emailError instanceof Error ? emailError.message : 'unknown',
        })
      );
    }
  }

  return NextResponse.json({ application: data, statusEmail });
}
