import { db } from '@/lib/db';
import type { ContractSection, ContractTemplate } from '@/lib/contract-templates';
import type { DocumentTemplate } from '@/lib/document-templates';

export type DocType = 'contract' | 'job_description' | 'handbook';

// The subset of a template an admin can edit from the dashboard. Anything left out (role slug,
// signatory, editable-field metadata) always comes from code, so an override can never break the
// auto-fill mechanism or misrepresent which role a document is for.
export type EditableDocumentContent = {
  documentTitle?: string;
  intro?: string;
  templateNotes?: string[];
  sections?: ContractSection[];
  schedules?: ContractSection[];
  closingNote?: string;
};

function normalizeRoleSlug(roleSlug: string | null | undefined): string {
  return roleSlug || '';
}

export async function getDocumentOverride(docType: DocType, roleSlug: string | null): Promise<EditableDocumentContent | null> {
  const { data, error } = await db()
    .from('recruitment_document_overrides')
    .select('content')
    .eq('doc_type', docType)
    .eq('role_slug', normalizeRoleSlug(roleSlug))
    .maybeSingle();

  if (error || !data) return null;
  return data.content as EditableDocumentContent;
}

export async function saveDocumentOverride(
  docType: DocType,
  roleSlug: string | null,
  content: EditableDocumentContent,
  updatedBy: string
): Promise<void> {
  const { error } = await db()
    .from('recruitment_document_overrides')
    .upsert(
      {
        doc_type: docType,
        role_slug: normalizeRoleSlug(roleSlug),
        content,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'doc_type,role_slug' }
    );

  if (error) throw new Error(error.message);
}

export function extractEditableContent(template: {
  documentTitle: string;
  intro: string;
  templateNotes: string[];
  sections: ContractSection[];
  schedules?: ContractSection[];
  closingNote?: string;
}): EditableDocumentContent {
  return {
    documentTitle: template.documentTitle,
    intro: template.intro,
    templateNotes: template.templateNotes,
    sections: template.sections,
    schedules: template.schedules,
    closingNote: template.closingNote,
  };
}

export function mergeContractTemplate(base: ContractTemplate, override: EditableDocumentContent | null): ContractTemplate {
  if (!override) return base;
  return {
    ...base,
    documentTitle: override.documentTitle ?? base.documentTitle,
    intro: override.intro ?? base.intro,
    templateNotes: override.templateNotes ?? base.templateNotes,
    sections: override.sections ?? base.sections,
    schedules: override.schedules ?? base.schedules,
    closingNote: override.closingNote ?? base.closingNote,
  };
}

export function mergeDocumentTemplate(base: DocumentTemplate, override: EditableDocumentContent | null): DocumentTemplate {
  if (!override) return base;
  return {
    ...base,
    documentTitle: override.documentTitle ?? base.documentTitle,
    intro: override.intro ?? base.intro,
    templateNotes: override.templateNotes ?? base.templateNotes,
    sections: override.sections ?? base.sections,
  };
}
