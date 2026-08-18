import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recruitmentStatuses } from '@/lib/recruitment-config';
import { isAdminRequestAuthenticated } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';

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
  if (!isAdminRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const body = await request.json();
  const { id: applicationId } = await context.params;

  if (body.status && !recruitmentStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
  }

  const client = db();
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
    actor: 'admin',
    metadata: {
      status: body.status || data.status,
      notes_updated: typeof body.notes === 'string',
    },
  });

  return NextResponse.json({ application: data });
}
