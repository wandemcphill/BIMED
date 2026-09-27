import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import {
  expireDeteContractSignature,
  getDeteContractSignatureByToken,
  markDeteContractSignatureSigned,
} from '@/lib/dete-contract-signature';
import { sendDetePermitContractSignedNotificationEmails } from '@/lib/email';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

function requestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const direct = request.headers.get('x-real-ip')?.trim();
  return forwarded || direct || null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const rateLimit = await checkRateLimit({
    key: 'sign-dete-contract:' + token.slice(0, 24),
    limit: 10,
    windowMs: 60 * 60 * 1000,
    request,
  });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many signing attempts. Please try again later.' }, { status: 429 });

  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.candidateApplication);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data as Record<string, unknown>;
  const signedName = body.signed_name;

  if (typeof signedName !== 'string' || !signedName.trim() || signedName.trim().length > 200) {
    return NextResponse.json({ error: 'A valid signed_name is required.' }, { status: 400 });
  }

  try {
    const signature = await getDeteContractSignatureByToken(token);
    if (!signature) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 });

    if (signature.status === 'signed') {
      return NextResponse.json({ error: 'This permit-stage contract has already been signed.' }, { status: 409 });
    }
    if (signature.status === 'revoked') {
      return NextResponse.json({ error: 'This signing link has been replaced. Ask BIMED to email the current link.' }, { status: 409 });
    }
    if (signature.status === 'expired' || (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now())) {
      if (signature.status === 'issued') await expireDeteContractSignature(signature.id);
      return NextResponse.json({ error: 'This signing link has expired. Ask BIMED to issue a new permit-stage contract link.' }, { status: 410 });
    }

    const updated = await markDeteContractSignatureSigned(
      signature.id,
      signedName.trim(),
      requestIp(request),
      request.headers.get('user-agent'),
    );
    if (!updated) return NextResponse.json({ error: 'This permit-stage contract has already been signed.' }, { status: 409 });

    const client = db();
    await recordRecruitmentAudit(client, {
      applicationId: updated.application_id,
      staffId: updated.staff_id,
      actor: updated.employee_signed_name || signedName.trim(),
      eventType: 'dete_permit_contract_signed',
      metadata: {
        signature_id: updated.id,
        employer_signed_name: updated.employer_signed_name,
        employer_signed_at: updated.employer_signed_at,
        employee_signed_at: updated.employee_signed_at,
      },
    });

    const { data: application } = await client
      .from('recruitment_applications')
      .select('id,full_name,email,role_applied')
      .eq('id', updated.application_id)
      .maybeSingle();

    if (application) {
      await sendDetePermitContractSignedNotificationEmails(
        {
          application,
          signedName: updated.employee_signed_name || signedName.trim(),
          signedAt: updated.employee_signed_at || new Date().toISOString(),
          signatureId: updated.id,
        },
        client
      );
    }

    return NextResponse.json({
      ok: true,
      signature: {
        id: updated.id,
        status: updated.status,
        signedName: updated.employee_signed_name,
        signedAt: updated.employee_signed_at,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'dete_contract_signature.sign_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to sign the permit-stage contract right now.' }, { status: 500 });
  }
}
