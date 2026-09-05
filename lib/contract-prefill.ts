import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionFromToken } from '@/lib/admin-session';
import { applyContractOverrides, getContractTemplate, type ContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';

export type ContractPrefillResult =
  | { status: 'template'; template: ContractTemplate; prefilledFor?: { name: string; email: string } }
  | { status: 'unauthorized' }
  | { status: 'not_found' };

// Resolves the contract to render for a role page. With no applicationId this is just the blank,
// public template (still merged with any admin content edits). With an applicationId, the caller
// is asking for a real candidate's data to be filled in - that only happens for a verified admin
// session, otherwise the page must refuse to render the candidate's personal details.
export async function resolveContractTemplate(roleSlug: string, applicationId?: string): Promise<ContractPrefillResult> {
  const rawTemplate = getContractTemplate(roleSlug);
  if (!rawTemplate) return { status: 'not_found' };

  let baseTemplate = rawTemplate;
  try {
    const override = await getDocumentOverride('contract', roleSlug);
    baseTemplate = mergeContractTemplate(rawTemplate, override);
  } catch {
    // Fall back to the code-defined template if the override lookup fails.
  }

  if (!applicationId) {
    return { status: 'template', template: baseTemplate };
  }

  const cookieStore = await cookies();
  const session = await getAdminSessionFromToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return { status: 'unauthorized' };
  }

  let application;
  try {
    const result = await db()
      .from('recruitment_applications')
      .select('full_name,email,address,start_date')
      .eq('id', applicationId)
      .maybeSingle();
    if (result.error || !result.data) return { status: 'not_found' };
    application = result.data;
  } catch {
    return { status: 'not_found' };
  }

  const template = applyContractOverrides(baseTemplate, {
    employeeName: application.full_name,
    employeeAddress: application.address,
    startDate: application.start_date,
  });

  return {
    status: 'template',
    template,
    prefilledFor: { name: application.full_name, email: application.email },
  };
}
