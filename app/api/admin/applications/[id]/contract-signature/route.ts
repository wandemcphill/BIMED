import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { listContractSignaturesForApplication } from '@/lib/contract-signature';

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
  void request;
  void context;
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  return NextResponse.json(
    { error: 'Standalone contract signing requests are disabled. Use the complete onboarding pack so contract, job description and handbook are issued together.' },
    { status: 409 },
  );
}
