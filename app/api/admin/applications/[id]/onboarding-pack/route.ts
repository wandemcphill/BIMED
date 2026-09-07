import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { getContractTemplate } from '@/lib/contract-templates';
import { createDocumentSignatureRequest } from '@/lib/contract-signature';
import { createPacketAccess, packetList } from '@/lib/document-packets';
import { sendFullOnboardingPackEmail } from '@/lib/full-onboarding-pack';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const rateLimit = await checkRateLimit({ key: 'admin-onboarding-pack', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const roleSlug = (bodyResult.data as Record<string, unknown>).role_slug;
  if (typeof roleSlug !== 'string' || !getContractTemplate(roleSlug)) return NextResponse.json({ error: 'A valid role_slug is required.' }, { status: 400 });

  const { id: applicationId } = await context.params;
  const client = db();
  try {
    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, address, start_date, role_applied, status, living_in_ireland')
      .eq('id', applicationId).maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

    const contractInfo = { applicationId: application.id, employeeName: application.full_name, employeeAddress: application.address, startDate: application.start_date, issuedBy: session.email };
    const [contractResult, jobDescResult, handbookResult] = await Promise.all([
      createDocumentSignatureRequest({ ...contractInfo, docType: 'contract', roleSlug }),
      createDocumentSignatureRequest({ ...contractInfo, docType: 'job_description', roleSlug }),
      createDocumentSignatureRequest({ ...contractInfo, docType: 'handbook', roleSlug: '' }),
    ]);

    const international = application.living_in_ireland === 'No';
    const packetEntries = packetList(international);
    const packetResults = await Promise.all(packetEntries.map((packet) => createPacketAccess(application.id, packet.slug, session.email)));
    const packetLinks = packetResults.map((result) => ({
      label: packetEntries.find((packet) => packet.slug === result.record.packet_slug)?.title || 'Open BIMED document',
      url: result.url,
    }));

    const email = await sendFullOnboardingPackEmail({ application, contractSignUrl: contractResult.signUrl, jobDescriptionUrl: jobDescResult.signUrl, handbookUrl: handbookResult.signUrl, packetLinks, packId: contractResult.record.id }, client);
    const previousStatus = application.status;
    if (previousStatus !== 'Offer Issued') await client.from('recruitment_applications').update({ status: 'Offer Issued', updated_at: new Date().toISOString() }).eq('id', applicationId);

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      eventType: 'onboarding_pack_sent',
      actor: session.email,
      metadata: {
        contract_signature_id: contractResult.record.id,
        job_description_signature_id: jobDescResult.record.id,
        handbook_signature_id: handbookResult.record.id,
        packet_access_ids: packetResults.map((result) => result.record.id),
        packet_slugs: packetResults.map((result) => result.record.packet_slug),
        international, role_slug: roleSlug, previous_status: previousStatus, email_status: email.status,
      },
    });

    return NextResponse.json({ signature: contractResult.record, signUrl: contractResult.signUrl, jobDescriptionUrl: jobDescResult.signUrl, handbookUrl: handbookResult.signUrl, packetLinks, international, email });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'onboarding_pack.send_failed', application_id: applicationId, reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to send the onboarding pack right now.' }, { status: 500 });
  }
}
