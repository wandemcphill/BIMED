import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendDocumentReadyToSignEmail } from '@/lib/email';
import { getJobDescriptionTemplate } from '@/lib/document-templates';
import { createDocumentSignatureRequest, listContractSignaturesForApplication, type SignableDocType } from '@/lib/contract-signature';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';
import { recruitmentRoleSlug, BIMED_DEFAULT_START_DATE, BIMED_DEFAULT_START_DATE_ISO } from '@/lib/bimed-role-policy';

type RouteContext = { params: Promise<{ id: string }> };

function documentLabelFor(docType: SignableDocType, roleSlug: string): string {
  if (docType === 'handbook') return 'Employee Handbook';
  const template = getJobDescriptionTemplate(roleSlug);
  return template ? `${template.roleLabel} Job Description` : 'Job Description';
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const docType = searchParams.get('doc_type') as SignableDocType | null;
  if (docType !== 'handbook' && docType !== 'job_description') {
    return NextResponse.json({ error: 'A valid doc_type (handbook or job_description) is required.' }, { status: 400 });
  }
  const { id: applicationId } = await context.params;
  const signatures = await listContractSignaturesForApplication(applicationId, docType);
  return NextResponse.json({ signatures });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-document-signature', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const docType = bodyResult.data.doc_type as SignableDocType;
  if (docType !== 'handbook' && docType !== 'job_description') {
    return NextResponse.json({ error: 'A valid doc_type (handbook or job_description) is required.' }, { status: 400 });
  }

  const requestedRoleSlug = typeof bodyResult.data.role_slug === 'string' ? bodyResult.data.role_slug : '';
  if (docType === 'job_description' && !getJobDescriptionTemplate(requestedRoleSlug)) {
    return NextResponse.json({ error: 'A valid role_slug is required for a job description.' }, { status: 400 });
  }

  const { id: applicationId } = await context.params;
  const client = db();

  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, address, start_date, role_applied, status')
      .eq('id', applicationId)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    let roleSlug = '';
    if (docType === 'job_description') {
      const expectedRoleSlug = recruitmentRoleSlug(application.role_applied);
      if (!expectedRoleSlug) {
        return NextResponse.json({ error: 'This application has an invalid recruitment role.' }, { status: 400 });
      }

      roleSlug = expectedRoleSlug;
      if (requestedRoleSlug !== expectedRoleSlug) {
        return NextResponse.json(
          { error: 'The job description role must match the candidate\'s applied role.' },
          { status: 400 },
        );
      }
    }

    const startDate = BIMED_DEFAULT_START_DATE_ISO;
    const { record, signUrl } = await createDocumentSignatureRequest({
      applicationId: application.id,
      docType,
      roleSlug,
      employeeName: application.full_name,
      employeeAddress: application.address,
      startDate,
      issuedBy: session.email,
    });

    const documentLabel = documentLabelFor(docType, roleSlug);

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      eventType: 'document_signature_requested',
      actor: session.email,
      metadata: {
        signature_id: record.id,
        doc_type: docType,
        role_slug: roleSlug,
        start_date: startDate,
        canonical_default_start_date: BIMED_DEFAULT_START_DATE,
      },
    });

    const email = await sendDocumentReadyToSignEmail(
      { application, documentLabel, signUrl, signatureId: record.id },
      client
    );

    return NextResponse.json({ signature: record, signUrl, email });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'document_signature.create_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to create the signature request right now.' }, { status: 500 });
  }
}
