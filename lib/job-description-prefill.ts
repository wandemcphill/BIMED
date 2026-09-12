import { db } from '@/lib/db';
import { getJobDescriptionTemplate, type DocumentTemplate } from '@/lib/document-templates';
import { getDocumentOverride, mergeDocumentTemplate } from '@/lib/document-overrides';
import { applyBimedJobDescriptionDefaults } from '@/lib/bimed-role-policy';

export type JobDescriptionResult =
  | { status: 'template'; template: DocumentTemplate }
  | { status: 'not_found' };

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

  template = applyBimedJobDescriptionDefaults(template);

  if (!applicationId) {
    return { status: 'template', template };
  }

  try {
    const { data: application } = await db()
      .from('recruitment_applications')
      .select('full_name,address')
      .eq('id', applicationId)
      .maybeSingle();
    if (!application) return { status: 'template', template };

    const [roleSummary, ...restSections] = template.sections;
    if (!roleSummary) return { status: 'template', template };

    const preparedFor = `Prepared for: ${application.full_name}`;
    const employeeAddress = application.address?.trim() ? `Employee residential address: ${application.address.trim()}` : null;

    template = {
      ...template,
      sections: [
        {
          ...roleSummary,
          paragraphs: [preparedFor, ...(employeeAddress ? [employeeAddress] : []), ...roleSummary.paragraphs],
        },
        ...restSections,
      ],
    };
  } catch {
    // If the candidate lookup fails, still show the generic job description rather than erroring.
  }

  return { status: 'template', template };
}
