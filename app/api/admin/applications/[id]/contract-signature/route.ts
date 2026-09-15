import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendContractReadyToSignEmail } from '@/lib/email';
import { getContractTemplate } from '@/lib/contract-templates';
import { createContractSignatureRequest, listContractSignaturesForApplication } from '@/lib/contract-signature';
import { BIMED_DEFAULT_START_DATE, recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

const BIMED_CANONICAL_START_DATE_ISO = '2027-01-11';

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id: applicationId } = await context.params;
  const signatures = await listContractSignaturesForApplication(applicationId, 'contract');
  return NextResponse.json({ signatures });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-contract-signature', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const requestedRoleSlug = bodyResult.data.role_slug;
  if (typeof requestedRoleSlug !== 'string' || !getContractTemplate(requestedRoleSlug)) {
    return NextResponse.json({ error: 'A valid role_slug is required.' }, { status: 400 });
  }

  const { id: applicationId } = await context.params;
  const client = db();

  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, address, role_applied, status')
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
        { error: 'The contract role must match the candidate\'s applied role.' },
        { status: 400 },
      );
    }

    const startDate = BIMED_CANONICAL_START_DATE_ISO;

    const { record, signUrl } = await createContractSignatureRequest({
      applicationId: application.id,
      roleSlug: expectedRoleSlug,
      employeeName: application.full_name,
      employeeAddress: application.address,
      startDate,
      issuedBy: session.email,
    });

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      eventType: 'contract_signature_requested',
      actor: session.email,
      metadata: { signature_id: record.id, role_slug: expectedRoleSlug, start_date: startDate, canonical_default_start_date: BIMED_DEFAULT_START_DATE },
    });

    const email = await sendContractReadyToSignEmail(
      { application, signUrl, signatureId: record.id },
      client
    );

    return NextResponse.json({ signature: record, signUrl, email });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'contract_signature.create_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to create the signature request right now.' }, { status: 500 });
  }
}
