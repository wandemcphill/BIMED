import { db } from '@/lib/db';
import { getJobDescriptionTemplate, type DocumentTemplate } from '@/lib/document-templates';
import { getDocumentOverride, mergeDocumentTemplate } from '@/lib/document-overrides';

export type JobDescriptionResult =
  | { status: 'template'; template: DocumentTemplate }
  | { status: 'not_found' };

// Mirrors resolveContractTemplate (lib/contract-prefill.ts): merges any admin content edits, and
// when issued for a specific candidate, adds their name to the Role Summary so the document reads
// as theirs without any manual typing.
//
// Unlike the contract pre-fill page, this link is emailed directly to the candidate with no admin
// session involved - the applicationId itself (an unguessable UUID) is what's shown here, and the
// document only carries the candidate's name, not their address or other sensitive fields.
export async function resolveJobDescriptionTemplate(slug: string, applicationId?: string): Promise<JobDescriptionResult> {
  const rawTemplate = getJobDescriptionTemplate(slug);
  if (!rawTemplate) return { status: 'not_found' };

  let template = rawTemplate;
  try {
    const override = await getDocumentOverride('job_description', slug);
    template = mergeDocumentTemplate(rawTemplate, override);
  } catch {
    // Fall back to the code-defined template if the override lookup fails.
  }

  if (!applicationId) {
    return { status: 'template', template };
  }

  try {
    const { data: application } = await db()
      .from('recruitment_applications')
      .select('full_name')
      .eq('id', applicationId)
      .maybeSingle();
    if (!application) return { status: 'template', template };

    const [roleSummary, ...restSections] = template.sections;
    if (!roleSummary) return { status: 'template', template };

    template = {
      ...template,
      sections: [
        { ...roleSummary, paragraphs: [`Prepared for: ${application.full_name}`, ...roleSummary.paragraphs] },
        ...restSections,
      ],
    };
  } catch {
    // If the candidate lookup fails, still show the generic job description rather than erroring.
  }

  return { status: 'template', template };
}
