import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendOnboardingPackEmail } from '@/lib/email';
import { getContractTemplate } from '@/lib/contract-templates';
import { createDocumentSignatureRequest } from '@/lib/contract-signature';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

// Issues the full onboarding pack to a candidate in one action: creates a contract signing link,
// builds the job description and handbook links, emails all three to the candidate, and marks the
// application "Offer Issued". This is the actual delivery step - it's what a candidate needs to
// receive their documents, as distinct from an admin just previewing them in their own browser.
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-onboarding-pack', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const roleSlug = (bodyResult.data as Record<string, unknown>).role_slug;
  if (typeof roleSlug !== 'string' || !getContractTemplate(roleSlug)) {
    return NextResponse.json({ error: 'A valid role_slug is required.' }, { status: 400 });
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

    const contractInfo = {
      applicationId: application.id,
      employeeName: application.full_name,
      employeeAddress: application.address,
      startDate: application.start_date,
      issuedBy: session.email,
    };

    const [contractResult, jobDescResult, handbookResult] = await Promise.all([
      createDocumentSignatureRequest({ ...contractInfo, docType: 'contract', roleSlug }),
      createDocumentSignatureRequest({ ...contractInfo, docType: 'job_description', roleSlug }),
      createDocumentSignatureRequest({ ...contractInfo, docType: 'handbook', roleSlug: '' }),
    ]);

    const email = await sendOnboardingPackEmail(
      {
        application,
        contractSignUrl: contractResult.signUrl,
        jobDescriptionUrl: jobDescResult.signUrl,
        handbookUrl: handbookResult.signUrl,
        packId: contractResult.record.id,
      },
      client
    );

    const previousStatus = application.status;
    if (previousStatus !== 'Offer Issued') {
      await client.from('recruitment_applications').update({ status: 'Offer Issued', updated_at: new Date().toISOString() }).eq('id', applicationId);
    }

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      eventType: 'onboarding_pack_sent',
      actor: session.email,
      metadata: {
        contract_signature_id: contractResult.record.id,
        job_description_signature_id: jobDescResult.record.id,
        handbook_signature_id: handbookResult.record.id,
        role_slug: roleSlug,
        previous_status: previousStatus,
        email_status: email.status,
      },
    });

    return NextResponse.json({
      signature: contractResult.record,
      signUrl: contractResult.signUrl,
      jobDescriptionUrl: jobDescResult.signUrl,
      handbookUrl: handbookResult.signUrl,
      email,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'onboarding_pack.send_failed',
      application_id: applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to send the onboarding pack right now.' }, { status: 500 });
  }
}
