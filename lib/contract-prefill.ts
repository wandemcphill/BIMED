import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionFromToken } from '@/lib/admin-session';
import { applyContractOverrides, getContractTemplate, type ContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { applyBimedContractDefaults } from '@/lib/bimed-role-policy';
import { resolveContractAddress, type ContractAddressResolution } from '@/lib/contract-accommodation';

export type ContractPrefillResult =
  | { status: 'template'; template: ContractTemplate; prefilledFor?: { name: string; email: string } }
  | { status: 'unauthorized' }
  | { status: 'not_found' }
  | { status: 'blocked'; reason: string };

// Resolves the contract to render for a role page. With no applicationId this is the Bimed-wide
// default role contract with canonical manager/start/probation/pay-frequency terms. With an
// applicationId, candidate data is filled only for a verified admin session.
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
    return { status: 'template', template: applyBimedContractDefaults(baseTemplate) };
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
      .select('full_name,email,address,start_date,living_in_ireland,contract_accommodation_option,verified_irish_residential_address,contract_accommodation_verified_at,contract_accommodation_verified_by')
      .eq('id', applicationId)
      .maybeSingle();
    if (result.error || !result.data) return { status: 'not_found' };
    application = result.data;
  } catch {
    return { status: 'not_found' };
  }

  const addressResolution: ContractAddressResolution = resolveContractAddress(application);
  if (!addressResolution.ready) {
    return { status: 'blocked', reason: addressResolution.message };
  }

  const templateWithCandidate = applyContractOverrides(baseTemplate, {
    employeeName: application.full_name,
    employeeAddress: addressResolution.employeeAddress,
    employeeAddressStatus:
      addressResolution.mode === 'private_verified'
        ? 'Private Accommodation: verified Irish residential address included.'
        : addressResolution.mode === 'not_verified'
          ? 'Accommodation Not Verified: no Irish residential address included.'
          : addressResolution.employeeAddress
            ? 'Ireland-based candidate: recorded residential address included.'
            : 'Ireland-based candidate: no residential address recorded.',
    startDate: application.start_date,
  });

  return {
    status: 'template',
    template: applyBimedContractDefaults(templateWithCandidate),
    prefilledFor: { name: application.full_name, email: application.email },
  };
}
