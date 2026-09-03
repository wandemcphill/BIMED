import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { sendContractSignedNotificationEmails } from '@/lib/email';
import { getContractSignatureByToken, markContractSignatureSigned } from '@/lib/contract-signature';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit({ key: 'sign-contract', limit: 10, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const signedName = (bodyResult.data as Record<string, unknown>).signed_name;
  if (typeof signedName !== 'string' || !signedName.trim() || signedName.trim().length > 200) {
    return NextResponse.json({ error: 'A valid signed_name is required.' }, { status: 400 });
  }

  const { token } = await context.params;

  try {
    const signature = await getContractSignatureByToken(token);
    if (!signature) return NextResponse.json({ error: 'Signature request not found.' }, { status: 404 });
    if (signature.status === 'signed') return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });
    if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This signing link has expired. Ask Bimed to issue a new one.' }, { status: 410 });
    }

    const client = db();
    const updated = await markContractSignatureSigned(signature.id, signedName.trim());
    if (!updated) return NextResponse.json({ error: 'This contract has already been signed.' }, { status: 409 });

    const { data: application } = await client
      .from('recruitment_applications')
      .select('id, full_name, email, role_applied')
      .eq('id', updated.application_id)
      .maybeSingle();

    await recordRecruitmentAudit(client, {
      applicationId: updated.application_id,
      eventType: 'contract_signed',
      actor: signedName.trim(),
      metadata: { signature_id: updated.id, role_slug: updated.role_slug },
    });

    if (application) {
      await sendContractSignedNotificationEmails(
        {
          application,
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
      event: 'contract_signature.sign_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to sign the contract right now.' }, { status: 500 });
  }
}
