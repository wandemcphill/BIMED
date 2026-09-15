import type { ContractTemplate, ContractSection } from '@/lib/contract-templates';

export const BIMED_DEFAULT_LINE_MANAGER = 'Dezou Maurice';
export const BIMED_DEFAULT_START_DATE = '11 January 2027';
export const BIMED_DEFAULT_PROBATION = '3 months';
export const BIMED_DEFAULT_PAY_FREQUENCY = 'monthly';
export const BIMED_DEFAULT_CONTRACT_DURATION = 'Permanent employment, with no fixed end date';

export const BIMED_ROLE_SALARIES: Partial<Record<CanonicalRecruitmentRoleSlug, string>> = {
  'support-worker': '€36,000 per annum',
  'healthcare-assistant': '€36,000 per annum',
  'senior-support-worker': '€41,000 per annum',
  physiotherapist: '€55,000 per annum',
};

export const CANONICAL_RECRUITMENT_ROLES = [
  'Support Worker',
  'Healthcare Assistant',
  'Senior Support Worker',
  'Physiotherapist',
] as const;

export type CanonicalRecruitmentRole = (typeof CANONICAL_RECRUITMENT_ROLES)[number];
export type CanonicalRecruitmentRoleSlug =
  | 'support-worker'
  | 'healthcare-assistant'
  | 'senior-support-worker'
  | 'physiotherapist';

const ROLE_ALIASES: Record<string, CanonicalRecruitmentRole> = {
  'healthcare worker': 'Healthcare Assistant',
};

const ROLE_SLUGS: Record<CanonicalRecruitmentRole, CanonicalRecruitmentRoleSlug> = {
  'Support Worker': 'support-worker',
  'Healthcare Assistant': 'healthcare-assistant',
  'Senior Support Worker': 'senior-support-worker',
  Physiotherapist: 'physiotherapist',
};

export function normalizeRecruitmentRole(value: string | null | undefined): CanonicalRecruitmentRole | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  const direct = CANONICAL_RECRUITMENT_ROLES.find((role) => role.toLowerCase() === normalized);
  if (direct) return direct;

  return ROLE_ALIASES[normalized] ?? null;
}

export function recruitmentRoleSlug(value: string | null | undefined): CanonicalRecruitmentRoleSlug | null {
  const role = normalizeRecruitmentRole(value);
  return role ? ROLE_SLUGS[role] : null;
}

function replaceText(value: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((current, [from, to]) => current.split(from).join(to), value);
}

function applySectionReplacements(section: ContractSection, replacements: Array<[string, string]>): ContractSection {
  return {
    ...section,
    heading: replaceText(section.heading, replacements),
    paragraphs: section.paragraphs.map((paragraph) => replaceText(paragraph, replacements)),
    bullets: section.bullets?.map((bullet) => replaceText(bullet, replacements)),
  };
}

function permitCategoryForRole(roleSlug: CanonicalRecruitmentRoleSlug): string | null {
  if (roleSlug === 'physiotherapist') {
    return 'Critical Skills Employment Permit (CSEP), subject to DETE eligibility and final assessment';
  }

  return null;
}

export function applyBimedContractDefaults(
  template: ContractTemplate,
  overrides?: { employeeName?: string | null; employeeAddress?: string | null; startDate?: string | null }
): ContractTemplate {
  const startDate = overrides?.startDate
    ? new Date(overrides.startDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
    : BIMED_DEFAULT_START_DATE;

  const roleSlug = template.roleSlug as CanonicalRecruitmentRoleSlug;
  const roleSalary = BIMED_ROLE_SALARIES[roleSlug];
  const permitCategory = permitCategoryForRole(roleSlug);
  const replacements: Array<[string, string]> = [
    ['[Insert line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
    ['[line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
    ['[Insert start date]', startDate],
    ['[start date]', startDate],
    ['[weekly / fortnightly / monthly]', BIMED_DEFAULT_PAY_FREQUENCY],
    ['Job title: [insert]', `Job title: ${template.roleLabel}`],
    ['Reports to: [insert]', `Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`],
    ['Job title: [insert] Reports to: [insert]', `Job title: ${template.roleLabel} Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`],
    ['The first 6 months of your employment is a probationary period', `The first ${BIMED_DEFAULT_PROBATION} of your employment is a probationary period`],
    ['extend your probationary period once, up to a combined maximum of 12 months', 'extend your probationary period once, up to a combined maximum of 6 months'],
  ];

  if (roleSalary) replacements.push(['[Insert pay rate for this role]', roleSalary]);

  if (overrides?.employeeName) {
    replacements.push(['[Insert employee name]', overrides.employeeName], ['[Employee full name]', overrides.employeeName]);
  }
  if (overrides?.employeeAddress) {
    replacements.push(['[Insert employee address]', overrides.employeeAddress], ['[Employee address]', overrides.employeeAddress]);
  }

  const editableFields = template.editableFields.map((field) => ({
    ...field,
    value: replaceText(field.value, replacements),
    note:
      field.label === 'Line manager'
        ? 'Bimed default reporting line: Dezou Maurice.'
        : field.label === 'Start date'
          ? `Default commencement date: ${BIMED_DEFAULT_START_DATE}. Candidate-specific dates override this default.`
          : field.label === 'Pay'
            ? roleSalary ? `Agreed BIMED salary: ${roleSalary}.` : field.note
            : field.label === 'Pay frequency'
              ? 'Bimed payroll frequency: monthly.'
              : field.note,
  }));

  if (!editableFields.some((field) => field.label === 'Contract duration')) {
    editableFields.push({
      label: 'Contract duration',
      value: BIMED_DEFAULT_CONTRACT_DURATION,
      note: 'BIMED contracts are permanent unless a candidate-specific written variation expressly states otherwise. A permanent CSEP role satisfies the required minimum job-offer duration subject to DETE assessment.',
    });
  }

  if (permitCategory && !editableFields.some((field) => field.label === 'Employment permit category')) {
    editableFields.push({
      label: 'Employment permit category',
      value: permitCategory,
      note: 'This describes the intended permit pathway only. Final permit eligibility and grant are determined by the Department of Enterprise, Tourism and Employment.',
    });
  }

  const sections = template.sections.map((section) => applySectionReplacements(section, replacements));
  const commencementSection = sections.find((section) => section.heading === '2. Commencement of Employment and Probation');
  if (commencementSection && !commencementSection.paragraphs.some((paragraph) => paragraph.startsWith('2.6 Contract duration:'))) {
    commencementSection.paragraphs.push(`2.6 Contract duration: ${BIMED_DEFAULT_CONTRACT_DURATION}. There is no fixed end date unless a candidate-specific written variation expressly states otherwise.`);
  }

  if (permitCategory) {
    const rightToWorkSection = sections.find((section) => section.heading === '16. Right to Work');
    if (rightToWorkSection && !rightToWorkSection.paragraphs.some((paragraph) => paragraph.startsWith('16.')) && false) {
      rightToWorkSection.paragraphs.push(`Intended employment permit pathway: ${permitCategory}.`);
    } else if (rightToWorkSection && !rightToWorkSection.paragraphs.some((paragraph) => paragraph.includes('Intended employment permit pathway:'))) {
      rightToWorkSection.paragraphs.push(`Intended employment permit pathway: ${permitCategory}. Final eligibility and grant are determined by DETE.`);
    }
  }

  return {
    ...template,
    editableFields,
    sections,
    schedules: template.schedules.map((section) => applySectionReplacements(section, replacements)),
    closingNote: replaceText(template.closingNote, replacements),
  };
}

export function applyBimedJobDescriptionDefaults<T extends {
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
}>(template: T): T {
  const replacements: Array<[string, string]> = [
    ['[Insert line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
    ['[line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
  ];

  return {
    ...template,
    sections: template.sections.map((section) => applySectionReplacements(section as ContractSection, replacements)),
  } as T;
}
