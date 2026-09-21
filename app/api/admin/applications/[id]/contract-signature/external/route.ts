import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { getContractTemplate } from '@/lib/contract-templates';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({
    key: 'admin-external-contract-verification',
    limit: 30,
    windowMs: 60 * 60 * 1000,
    request,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
      );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  const requestedRoleSlug = bodyResult.data.role_slug;
  const note = typeof bodyResult.data.note === 'string' ? bodyResult.data.note.trim().slice(0, 2000) : '';

  if (typeof requestedRoleSlug !== 'string' || !getContractTemplate(requestedRoleSlug)) {
    return NextResponse.json({ error: 'A valid role_slug is required.' }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json({ error: 'A verification note is required.' }, { status: 400 });
  }

  const { id: applicationId } = await context.params;
  const client = db();

  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, role_applied')
      .eq('id', applicationId)
      .maybeSingle();

    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const expectedRoleSlug = recruitmentRoleSlug(application.role_applied);
    if (!expectedRoleSlug) {
      return NextResponse.json({ error: 'This application has an invalid recruitment role.' }, { status: 400 });
    }
    if (requestedRoleSlug !== expectedRoleSlug) {
      return NextResponse.json(
        { error: 'The external signed contract role must match the candidate\'s applied role.' },
        { status: 400 },
      );
    }

    const { data, error } = await client.rpc('bimed_record_external_contract_verification', {
      p_application_id: applicationId,
      p_role_slug: expectedRoleSlug,
      p_actor: session.email,
      p_note: note,
    });

    if (error || !data) {
      const message = error?.message || 'Unable to record the external contract verification.';
      if (message.includes('APPLICATION_NOT_FOUND')) {
        return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
      }
      if (message.includes('EXTERNAL_CONTRACT_ROLE_MISMATCH')) {
        return NextResponse.json({ error: 'The external signed contract role does not match the applied role.' }, { status: 409 });
      }
      throw error || new Error(message);
    }

    return NextResponse.json({ verification: data });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'external_contract_verification_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to record the external contract verification right now.' }, { status: 500 });
  }
}
