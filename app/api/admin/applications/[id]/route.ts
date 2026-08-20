import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession, isAdminRequestAuthenticated } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendApplicationStatusUpdateEmails } from '@/lib/email';
import { readJsonBody, validateApplicationPatch } from '@/lib/input-validation';

type RouteContext = { params: Promise<{ id: string }> };

function validId(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await isAdminRequestAuthenticated(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id: applicationId } = await context.params;
  if (!validId(applicationId)) return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });

  const client = db();
  const { data: application, error: applicationError } = await client.from('recruitment_applications').select('*').eq('id', applicationId).single();
  if (applicationError || !application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const { data: invite } = await client.from('recruitment_invites').select('*').eq('id', application.invite_id).maybeSingle();
  const auditQuery = client.from('recruitment_audit_log').select('*').order('created_at', { ascending: false }).limit(20);
  const { data: auditLog } = application.invite_id
    ? await auditQuery.or(`application_id.eq.${application.id},invite_id.eq.${application.invite_id}`)
    : await auditQuery.eq('application_id', application.id);

  return NextResponse.json({ application, invite, auditLog: auditLog || [] });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id: applicationId } = await context.params;
  if (!validId(applicationId)) return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });

  const parsed = await readJsonBody(request, 20 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const validation = validateApplicationPatch(parsed.value);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const client = db();
  const { data: before } = await client.from('recruitment_applications').select('status').eq('id', applicationId).maybeSingle();
  const previousStatus = before?.status || null;

  const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
  if (validation.value.status) updatePayload.status = validation.value.status;
  if (validation.value.notes !== null) updatePayload.admin_notes = validation.value.notes;

  const { data, error } = await client.from('recruitment_applications').update(updatePayload).eq('id', applicationId).select('*').single();
  if (error) return NextResponse.json({ error: 'Unable to update application.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  await recordRecruitmentAudit(client, {
    applicationId,
    inviteId: data.invite_id,
    eventType: 'admin_application_updated',
    actor: session.email,
    metadata: {
      status: validation.value.status || data.status,
      previous_status: previousStatus,
      notes_updated: validation.value.notes !== null,
    },
  });

  let statusEmail = null;
  if (validation.value.status && previousStatus && validation.value.status !== previousStatus) {
    try {
      const emails = await sendApplicationStatusUpdateEmails({
        application: data,
        previousStatus,
        status: validation.value.status,
        actor: session.email,
        notifyCandidate: validation.value.notify_candidate !== false,
      }, client);
      statusEmail = emails.candidate;
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'email.status_update_unhandled', application_id: applicationId, reason: emailError instanceof Error ? emailError.message : 'unknown' }));
    }
  }

  return NextResponse.json({ application: data, statusEmail });
}
