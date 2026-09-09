import type { ContractTemplate, ContractSection } from '@/lib/contract-templates';

export const BIMED_DEFAULT_LINE_MANAGER = 'Dezou Maurice';
export const BIMED_DEFAULT_START_DATE = '11 January 2027';
export const BIMED_DEFAULT_PROBATION = '3 months';
export const BIMED_DEFAULT_PAY_FREQUENCY = 'monthly';

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

/**
 * Applies BIMED-wide contractual defaults without duplicating them in each role template.
 * Role-specific hours, salary, duties and professional registration remain untouched.
 */
export function applyBimedContractDefaults(
  template: ContractTemplate,
  overrides?: { employeeName?: string | null; employeeAddress?: string | null; startDate?: string | null }
): ContractTemplate {
  const startDate = overrides?.startDate
    ? new Date(overrides.startDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
    : BIMED_DEFAULT_START_DATE;

  const replacements: Array<[string, string]> = [
    ['[Insert line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
    ['[line manager name/title]', BIMED_DEFAULT_LINE_MANAGER],
    ['[Insert start date]', startDate],
    ['[start date]', startDate],
    ['[weekly / fortnightly / monthly]', BIMED_DEFAULT_PAY_FREQUENCY],
    [
      'The first 6 months of your employment is a probationary period',
      `The first ${BIMED_DEFAULT_PROBATION} of your employment is a probationary period`,
    ],
    [
      'The Company may, in exceptional circumstances and where it is in your interest, extend your probationary period once, up to a combined maximum of 12 months. You will be told in writing of any extension and the reasons for it before the original probationary period ends.',
      'The Company does not ordinarily extend the probationary period beyond 3 months. Any exception would require a specific written agreement consistent with applicable law.',
    ],
  ];

  if (overrides?.employeeName) {
    replacements.push(['[Insert employee name]', overrides.employeeName], ['[Employee full name]', overrides.employeeName]);
  }
  if (overrides?.employeeAddress) {
    replacements.push(['[Insert employee address]', overrides.employeeAddress], ['[Employee address]', overrides.employeeAddress]);
  }

  return {
    ...template,
    editableFields: template.editableFields.map((field) => ({
      ...field,
      value: replaceText(field.value, replacements),
      note:
        field.label === 'Line manager'
          ? 'Bimed default reporting line: Dezou Maurice.'
          : field.label === 'Start date'
            ? `Default commencement date: ${BIMED_DEFAULT_START_DATE}. Candidate-specific dates override this default.`
            : field.label === 'Pay frequency'
              ? 'Bimed payroll frequency: monthly.'
              : field.note,
    })),
    sections: template.sections.map((section) => applySectionReplacements(section, replacements)),
    schedules: template.schedules.map((section) => applySectionReplacements(section, replacements)),
    closingNote: replaceText(template.closingNote, replacements),
  };
}

export function applyBimedJobDescriptionDefaults<T extends {
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
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
