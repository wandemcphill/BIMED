import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionFromToken } from '@/lib/admin-session';
import { applyContractOverrides, getContractTemplate, type ContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { applyBimedContractDefaults, BIMED_DEFAULT_START_DATE_ISO, recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { getSocClassification, isAdultAtEmploymentStart } from '@/lib/soc-classification';
import { resolveContractAddress, type ContractAddressResolution } from '@/lib/contract-accommodation';

export type ContractPrefillResult =
  | { status: 'template'; template: ContractTemplate; prefilledFor?: { name: string; email: string } }
  | { status: 'unauthorized' }
  | { status: 'not_found' }
  | { status: 'blocked'; reason: string };

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
  if (!session) return { status: 'unauthorized' };

  let application;
  try {
    const result = await db()
      .from('recruitment_applications')
      .select('full_name,email,address,start_date,date_of_birth,nationality,role_applied,living_in_ireland,country_of_residence,current_country,contract_accommodation_option,verified_irish_residential_address,contract_accommodation_verified_at,contract_accommodation_verified_by')
      .eq('id', applicationId)
      .maybeSingle();
    if (result.error || !result.data) return { status: 'not_found' };
    application = result.data;
  } catch {
    return { status: 'not_found' };
  }

  const applicantRoleSlug = recruitmentRoleSlug(application.role_applied);
  if (!applicantRoleSlug || applicantRoleSlug !== roleSlug) {
    return { status: 'blocked', reason: 'The contract role must match the candidate’s role in their recruitment application.' };
  }
  if (!String(application.nationality || '').trim()) {
    return { status: 'blocked', reason: 'Nationality is missing from the candidate’s recruitment application. Complete the application before preparing the contract.' };
  }
  if (!application.date_of_birth) {
    return { status: 'blocked', reason: 'Date of birth is missing from the candidate’s recruitment application. Complete the application before preparing the contract.' };
  }
  const employmentStartDate = application.start_date || BIMED_DEFAULT_START_DATE_ISO;
  if (!isAdultAtEmploymentStart(application.date_of_birth, employmentStartDate)) {
    return { status: 'blocked', reason: 'The date of birth in the recruitment application is invalid or would make the candidate under 18 on the planned employment start date. Correct the application before preparing the contract.' };
  }
  const socClassification = getSocClassification(application.role_applied);
  if (!socClassification) {
    return { status: 'blocked', reason: 'A verified SOC 2010 classification could not be matched to the application role. Confirm the role duties and occupational code before preparing the contract.' };
  }

  const addressResolution: ContractAddressResolution = resolveContractAddress(application);
  if (!addressResolution.ready) {
    return { status: 'blocked', reason: addressResolution.message };
  }

  const templateWithCandidate = applyContractOverrides(baseTemplate, {
    employeeName: application.full_name,
    dateOfBirth: new Date(application.date_of_birth + 'T12:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }),
    nationality: String(application.nationality).trim(),
    socClassification: socClassification.display,
    socClassificationNote: socClassification.note + ' Source: ' + socClassification.sourceUrl,
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
