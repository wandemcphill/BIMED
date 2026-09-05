import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { db } from '@/lib/db';
import { contractTemplates, getContractTemplate } from '@/lib/contract-templates';
import { employeeHandbookTemplate, getJobDescriptionTemplate, jobDescriptionTemplates } from '@/lib/document-templates';
import {
  extractEditableContent,
  getDocumentOverride,
  saveDocumentOverride,
  type DocType,
  type EditableDocumentContent,
} from '@/lib/document-overrides';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

const DOC_TYPES: DocType[] = ['contract', 'job_description', 'handbook'];

export const documentCatalog = [
  ...contractTemplates.map((t) => ({ docType: 'contract' as const, roleSlug: t.roleSlug, label: `Contract - ${t.roleLabel}` })),
  ...jobDescriptionTemplates.map((t) => ({ docType: 'job_description' as const, roleSlug: t.slug, label: `Job Description - ${t.roleLabel}` })),
  { docType: 'handbook' as const, roleSlug: '', label: 'Employee Handbook' },
];

function baseEditableContent(docType: DocType, roleSlug: string): EditableDocumentContent | null {
  if (docType === 'contract') {
    const template = getContractTemplate(roleSlug);
    return template ? extractEditableContent(template) : null;
  }
  if (docType === 'job_description') {
    const template = getJobDescriptionTemplate(roleSlug);
    return template ? extractEditableContent(template) : null;
  }
  return extractEditableContent(employeeHandbookTemplate);
}

export async function GET(request: NextRequest) {
  if (!await getAdminSession(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const docType = searchParams.get('doc_type') as DocType | null;
  const roleSlug = searchParams.get('role_slug') || '';

  if (!docType) {
    return NextResponse.json({ documents: documentCatalog });
  }

  if (!DOC_TYPES.includes(docType)) {
    return NextResponse.json({ error: 'Invalid doc_type.' }, { status: 400 });
  }

  const base = baseEditableContent(docType, roleSlug);
  if (!base) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const override = await getDocumentOverride(docType, roleSlug || null);

  return NextResponse.json({
    base,
    override,
    effective: {
      documentTitle: override?.documentTitle ?? base.documentTitle,
      intro: override?.intro ?? base.intro,
      templateNotes: override?.templateNotes ?? base.templateNotes,
      sections: override?.sections ?? base.sections,
      schedules: override?.schedules ?? base.schedules,
      closingNote: override?.closingNote ?? base.closingNote,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: 'admin-document-override', limit: 60, windowMs: 60 * 60 * 1000, request });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimit.retryAfterSeconds ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : undefined },
    );
  }

  const bodyResult = await readJsonBody<Record<string, unknown>>(request, MAX_JSON_BYTES.candidateApplication);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data;

  const docType = body.doc_type as DocType;
  const roleSlug = typeof body.role_slug === 'string' ? body.role_slug : '';
  if (!DOC_TYPES.includes(docType)) return NextResponse.json({ error: 'Invalid doc_type.' }, { status: 400 });
  if (!baseEditableContent(docType, roleSlug)) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const content = body.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return NextResponse.json({ error: 'content must be an object.' }, { status: 400 });
  }

  try {
    await saveDocumentOverride(docType, roleSlug || null, content as EditableDocumentContent, session.email);
    await recordRecruitmentAudit(db(), {
      eventType: 'document_override_saved',
      actor: session.email,
      metadata: { doc_type: docType, role_slug: roleSlug || null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'document_override.save_failed',
      reason: error instanceof Error ? error.message : 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to save the document right now.' }, { status: 500 });
  }
}
