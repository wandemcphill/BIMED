import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { listContractSignaturesForApplication, type SignableDocType } from '@/lib/contract-signature';

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
  void context;
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  return NextResponse.json(
    { error: 'Standalone document signing requests are disabled. Use the complete onboarding pack so contract, job description and handbook are issued together.' },
    { status: 409 },
  );
}
