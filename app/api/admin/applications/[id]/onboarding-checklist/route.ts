import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { ensureOnboardingChecklist, getOnboardingReadiness, type OnboardingChecklistStatus } from '@/lib/onboarding-readiness';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

async function loadApplication(applicationId: string) {
  const client = db();
  const { data, error } = await client
    .from('recruitment_applications')
    .select('id, full_name, living_in_ireland, role_applied')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  return { client, application: data };
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  try {
    const { client, application } = await loadApplication(id);
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    const readiness = await getOnboardingReadiness(client, application);
    return NextResponse.json({ application: { id: application.id, full_name: application.full_name }, ...readiness });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding_checklist.load_failed', application_id: id, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to load onboarding readiness.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data as Record<string, unknown>;
  const itemKey = typeof body.item_key === 'string' ? body.item_key.trim() : '';
  const status = body.status as OnboardingChecklistStatus;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
  if (!itemKey) return NextResponse.json({ error: 'item_key is required.' }, { status: 400 });
  if (status !== 'pending' && status !== 'completed' && status !== 'waived') {
    return NextResponse.json({ error: 'status must be pending, completed, or waived.' }, { status: 400 });
  }
  if (status === 'waived' && !notes) return NextResponse.json({ error: 'A note is required when waiving a required onboarding item.' }, { status: 400 });

  const { id } = await context.params;
  try {
    const { client, application } = await loadApplication(id);
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    await ensureOnboardingChecklist(client, application);

    const { data: current, error: currentError } = await client
      .from('recruitment_onboarding_checklist')
      .select('id, item_key, title, required, status')
      .eq('application_id', id)
      .eq('item_key', itemKey)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'Onboarding checklist item not found.' }, { status: 404 });
    if (!current.required && status === 'waived') return NextResponse.json({ error: 'Optional onboarding items cannot be waived.' }, { status: 400 });

    const now = new Date().toISOString();
    const update = {
      status,
      completed_at: status === 'pending' ? null : now,
      completed_by: status === 'pending' ? null : session.email,
      notes: notes || null,
    };
    const { data: updated, error: updateError } = await client
      .from('recruitment_onboarding_checklist')
      .update(update)
      .eq('id', current.id)
      .select('id, application_id, item_key, title, description, required, status, completed_at, completed_by, notes, created_at, updated_at')
      .single();
    if (updateError) throw updateError;

    const eventType = status === 'completed' ? 'onboarding_item_completed' : status === 'waived' ? 'onboarding_item_waived' : 'onboarding_item_reset';
    await recordRecruitmentAudit(client, {
      applicationId: id,
      eventType,
      actor: session.email,
      metadata: { item_key: itemKey, status, had_previous_status: current.status, notes_provided: Boolean(notes) },
    });

    const readiness = await getOnboardingReadiness(client, application);
    return NextResponse.json({ item: updated, ...readiness });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding_checklist.update_failed', application_id: id, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to update onboarding readiness.' }, { status: 500 });
  }
}
