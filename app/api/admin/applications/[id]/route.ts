import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recruitmentStatuses } from '@/lib/recruitment-config';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (request.headers.get('x-admin-password') !== process.env.ADMIN_PASSWORD) {
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

  return NextResponse.json({ application, invite });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (request.headers.get('x-admin-password') !== process.env.ADMIN_PASSWORD) {
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

  return NextResponse.json({ application: data });
}
