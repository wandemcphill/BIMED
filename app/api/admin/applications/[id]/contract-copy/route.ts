import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { createContractDocumentAccess } from '@/lib/contract-document-access';
import { sendContractDocumentCopyEmail } from '@/lib/email';
import { listContractSignaturesForApplication } from '@/lib/contract-signature';
import { recruitmentRoleSlug } from '@/lib/bimed-role-policy';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-contract-copy', limit: 30, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === 'signed' ? 'signed' : 'unsigned';
  const { id: applicationId } = await context.params;
  const client = db();

  const { data: application, error } = await client
    .from('recruitment_applications')
    .select('id, full_name, email, role_applied')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });

  const roleSlug = recruitmentRoleSlug(application.role_applied);
  if (!roleSlug) return NextResponse.json({ error: 'This application has an invalid recruitment role.' }, { status: 400 });

  const signatures = await listContractSignaturesForApplication(applicationId, 'contract');
  const signed = signatures.find((item) => item.status === 'signed') || null;
  const active = signatures.find((item) => item.status === 'issued') || null;

  if (mode === 'signed' && !signed) {
    return NextResponse.json({ error: 'There is no signed contract available for this candidate.' }, { status: 409 });
  }

  const selected = mode === 'signed' ? signed : (active || signed);
  const access = await createContractDocumentAccess({
    applicationId,
    signatureId: selected?.id || null,
    accessKind: mode,
    createdBy: session.email,
  });

  const email = await sendContractDocumentCopyEmail({
    application,
    documentUrl: access.url,
    signed: mode === 'signed',
    accessId: access.record.id,
  }, client);

  return NextResponse.json({
    url: access.url,
    access: access.record,
    email,
    roleSlug,
    signature: selected,
  });
}
