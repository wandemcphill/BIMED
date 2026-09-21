import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendContractReadyToSignEmail } from '@/lib/email';
import { getContractTemplate } from '@/lib/contract-templates';
import { createContractSignatureRequest, listContractSignaturesForApplication } from '@/lib/contract-signature';
import { BIMED_DEFAULT_START_DATE, BIMED_DEFAULT_START_DATE_ISO, recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';
import { getPreContractReadiness } from '@/lib/onboarding-readiness';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id: applicationId } = await context.params;
  const signatures = await listContractSignaturesForApplication(applicationId, 'contract');
  const { data: externalVerification } = await db()
    .from('recruitment_external_contract_verifications')
    .select('id, application_id, role_slug, source, verified_by, verified_at, note')
    .eq('application_id', applicationId)
    .maybeSingle();
  return NextResponse.json({ signatures, externalVerification: externalVerification || null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  return NextResponse.json(
    { error: 'Standalone contract signing requests are disabled. Use the complete onboarding pack so contract, job description and handbook are issued together.' },
    { status: 409 },
  );

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

    const readiness = await getPreContractReadiness(client, application);
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: 'Contract issuance is blocked until identity, qualification and references are verified or formally waived.',
          missing: readiness.missing,
        },
        { status: 409 },
      );
    }

    const startDate = BIMED_DEFAULT_START_DATE_ISO;

    const { record, signUrl } = await createContractSignatureRequest({
      applicationId: application.id,
      roleSlug: expectedRoleSlug,
      employeeName: application.full_name,
      employeeAddress: application.address,
      startDate,
      issuedBy: session.email,
    });

    const email = await sendContractReadyToSignEmail(
      { application, signUrl, signatureId: record.id },
      client
    );

    return NextResponse.json({ signature: record, signUrl, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create the signature request right now.';
    console.error(JSON.stringify({
      level: 'error',
      event: 'contract_signature.create_failed',
      application_id: applicationId,
      reason: message,
    }));
    if (message.includes('PRE_CONTRACT_VERIFICATION_BLOCKED') || message.includes('CONTRACT_ISSUANCE_STATUS_BLOCKED')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Unable to create the signature request right now.' }, { status: 500 });
  }
}
