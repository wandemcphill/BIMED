import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendDocumentSignedNotificationEmails } from '@/lib/email';
import { getContractSignatureByToken, markContractSignatureSigned, type SignableDocType } from '@/lib/contract-signature';
import { getJobDescriptionTemplate } from '@/lib/document-templates';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ docType: string; token: string }> };

function documentLabelFor(docType: SignableDocType, roleSlug: string): string {
  if (docType === 'handbook') return 'Employee Handbook';
  const template = getJobDescriptionTemplate(roleSlug);
  return template ? `${template.roleLabel} Job Description` : 'Job Description';
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { docType: rawDocType, token } = await context.params;
  const docType: SignableDocType | null = rawDocType === 'handbook' ? 'handbook' : rawDocType === 'job-description' ? 'job_description' : null;
  if (!docType) return NextResponse.json({ error: 'Unknown document type.' }, { status: 404 });

  const rateLimit = await checkRateLimit({ key: 'sign-document', limit: 10, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data as Record<string, unknown>;
  const signedName = body.signed_name;
  if (typeof signedName !== 'string' || !signedName.trim() || signedName.trim().length > 200) {
    return NextResponse.json({ error: 'A valid signed_name is required.' }, { status: 400 });
  }

  try {
    const signature = await getContractSignatureByToken(token);
    if (!signature || signature.doc_type !== docType) {
      return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 });
    }
    if (signature.status === 'signed') return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 });
    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This signing link has expired. Ask Bimed to issue a new one.' }, { status: 410 });
    }

    const client = db();
    const updated = await markContractSignatureSigned(signature.id, signedName.trim());
    if (!updated) return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 });

    const { data: application } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, role_applied')
      .eq('id', updated.application_id)
      .maybeSingle();

    await recordRecruitmentAudit(client, {
      applicationId: updated.application_id,
      eventType: 'document_signed',
      actor: signedName.trim(),
      metadata: { signature_id: updated.id, doc_type: docType, role_slug: updated.role_slug },
    });

    if (application) {
      await sendDocumentSignedNotificationEmails(
        {
          application,
          documentLabel: documentLabelFor(docType, updated.role_slug),
          signedName: updated.signed_name || signedName.trim(),
          signedAtLabel: new Date(updated.signed_at || Date.now()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
          signatureId: updated.id,
        },
        client
      );
    }

    return NextResponse.json({ signature: updated });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'document_signature.sign_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to sign this document right now.' }, { status: 500 });
  }
}
