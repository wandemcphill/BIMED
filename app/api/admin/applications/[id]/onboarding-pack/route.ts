import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { getContractTemplate } from '@/lib/contract-templates';
import { createDocumentSignatureRequest } from '@/lib/contract-signature';
import { createPacketAccess, packetList } from '@/lib/document-packets';
import { sendFullOnboardingPackEmail } from '@/lib/full-onboarding-pack';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';
import { db } from '@/lib/db';
import { recruitmentRoleSlug, BIMED_DEFAULT_START_DATE, BIMED_DEFAULT_START_DATE_ISO } from '@/lib/bimed-role-policy';
import { getPreContractReadiness } from '@/lib/onboarding-readiness';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const rateLimit = await checkRateLimit({ key: 'admin-onboarding-pack', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const requestedRoleSlug = (bodyResult.data as Record<string, unknown>).role_slug;
  if (typeof requestedRoleSlug !== 'string' || !getContractTemplate(requestedRoleSlug)) {
    return NextResponse.json({ error: 'A valid role_slug is required.' }, { status: 400 });
  }

  const { id: applicationId } = await context.params;
  const client = db();
  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, address, start_date, role_applied, status, living_in_ireland')
      .eq('id', applicationId).maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    const currentApplication = application;

    const expectedRoleSlug = recruitmentRoleSlug(currentApplication.role_applied);
    if (!expectedRoleSlug) return NextResponse.json({ error: 'This application has an invalid recruitment role.' }, { status: 400 });
    if (requestedRoleSlug !== expectedRoleSlug) return NextResponse.json({ error: 'The onboarding pack role must match the candidate\'s applied role.' }, { status: 400 });

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

    if (!['Submitted', 'Offer Issued', 'Onboarding', 'Hired'].includes(currentApplication.status)) {
      return NextResponse.json(
        { error: `The complete onboarding pack cannot be issued from ${currentApplication.status}.` },
        { status: 409 },
      );
    }

    const startDate = BIMED_DEFAULT_START_DATE_ISO;
    const contractInfo = {
      applicationId: currentApplication.id,
      employeeName: currentApplication.full_name,
      employeeAddress: currentApplication.address,
      startDate,
      issuedBy: session.email,
    };

    async function resolvePackDocument(docType: 'contract' | 'job_description' | 'handbook', roleSlug: string) {
      if (docType === 'contract') {
        const { data: externalVerification, error: externalVerificationError } = await client
          .from('recruitment_external_contract_verifications')
          .select('id, role_slug, verified_by, verified_at, note')
          .eq('application_id', currentApplication.id)
          .maybeSingle();

        if (externalVerificationError) throw externalVerificationError;

        if (externalVerification) {
          return {
            record: {
              id: externalVerification.id,
              application_id: currentApplication.id,
              doc_type: 'contract',
              role_slug: externalVerification.role_slug,
              status: 'signed',
              signed_name: currentApplication.full_name,
              signed_at: externalVerification.verified_at,
            },
            signUrl: null as string | null,
            signed: true,
          };
        }
      }

      const { data: latest, error: latestError } = await client
        .from('recruitment_contract_signatures')
        .select('*')
        .eq('application_id', currentApplication.id)
        .eq('doc_type', docType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;

      if (latest?.status === 'signed') {
        return {
          record: latest,
          signUrl: null as string | null,
          signed: true,
        };
      }

      const result = await createDocumentSignatureRequest({
        ...contractInfo,
        docType,
        roleSlug,
      });

      return {
        record: result.record,
        signUrl: result.signUrl,
        signed: false,
      };
    }

    const contractResult = await resolvePackDocument('contract', expectedRoleSlug);
    const [jobDescResult, handbookResult] = await Promise.all([
      resolvePackDocument('job_description', expectedRoleSlug),
      resolvePackDocument('handbook', ''),
    ]);

    const international = currentApplication.living_in_ireland === 'No';
    const packetEntries = packetList(international).filter((packet) => packet.onboardingEmail !== false);
    const packetResults = await Promise.all(packetEntries.map((packet) => createPacketAccess(currentApplication.id, packet.slug, session.email)));
    const packetLinks = packetResults.map((result) => ({
      label: packetEntries.find((packet) => packet.slug === result.record.packet_slug)?.title || 'Open BIMED document',
      url: result.url,
    }));

    const email = await sendFullOnboardingPackEmail({
      application,
      signingDocuments: [
        { label: 'Review and sign your employment contract', url: contractResult.signUrl, signed: contractResult.signed },
        { label: 'Review and sign your job description', url: jobDescResult.signUrl, signed: jobDescResult.signed },
        { label: 'Review and sign the employee handbook', url: handbookResult.signUrl, signed: handbookResult.signed },
      ],
      packetLinks,
      packId: contractResult.record.id,
    }, client);

    const previousStatus = currentApplication.status;
    const transitionedApplication = previousStatus === 'Submitted'
      ? { ...application, status: 'Offer Issued' }
      : application;

    await recordRecruitmentAudit(client, {
      applicationId: currentApplication.id,
      eventType: 'onboarding_pack_sent',
      actor: session.email,
      metadata: {
        contract_signature_id: contractResult.record.id,
        job_description_signature_id: jobDescResult.record.id,
        handbook_signature_id: handbookResult.record.id,
        packet_access_ids: packetResults.map((result) => result.record.id),
        packet_slugs: packetResults.map((result) => result.record.packet_slug),
        international,
        role_slug: expectedRoleSlug,
        previous_status: previousStatus,
        new_status: transitionedApplication.status,
        start_date: startDate,
        canonical_default_start_date: BIMED_DEFAULT_START_DATE,
        email_status: email.status,
      },
    });

    return NextResponse.json({
      signature: contractResult.record,
      signUrl: contractResult.signUrl,
      jobDescriptionUrl: jobDescResult.signUrl,
      handbookUrl: handbookResult.signUrl,
      packetLinks,
      international,
      email,
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding_pack.send_failed', application_id: applicationId, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to send the onboarding pack right now.' }, { status: 500 });
  }
}
