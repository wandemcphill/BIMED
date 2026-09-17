import type { ContractTemplate, ContractSection } from '@/lib/contract-templates';

export const BIMED_DEFAULT_LINE_MANAGER = 'Dezou Maurice';
export const BIMED_DEFAULT_START_DATE = '11 January 2027';
export const BIMED_DEFAULT_START_DATE_ISO = '2027-01-11';
export const BIMED_DEFAULT_END_DATE_ISO = '2029-01-10';
export const BIMED_DEFAULT_PROBATION = '3 months';
export const BIMED_DEFAULT_PAY_FREQUENCY = 'monthly';
export const BIMED_DEFAULT_CONTRACT_DURATION = `Fixed-term employment for two years, from ${BIMED_DEFAULT_START_DATE} to 10 January 2029`;

// Current 2026 standard General Employment Permit minimum annual remuneration published by DETE.
// This is a current compliance floor, not a guarantee that a future permit application will qualify.
export const BIMED_GEP_STANDARD_MAR_2026 = '€36,605 per annum';

export const BIMED_ROLE_SALARIES: Partial<Record<CanonicalRecruitmentRoleSlug, string>> = {
  'support-worker': BIMED_GEP_STANDARD_MAR_2026,
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

function permitFloorNoteForRole(roleSlug: CanonicalRecruitmentRoleSlug): string {
  switch (roleSlug) {
    case 'physiotherapist':
      return ' (current 2026 CSEP relevant-degree minimum annual remuneration is €40,904)';
    case 'healthcare-assistant':
      return ' (current 2026 HCA GEP minimum annual remuneration is €32,691)';
    case 'support-worker':
    case 'senior-support-worker':
      return ' (current 2026 standard GEP minimum annual remuneration is €36,605 unless a different statutory occupation-specific threshold applies)';
  }
}

export function applyBimedContractDefaults(
  template: ContractTemplate,
  overrides?: { employeeName?: string | null; employeeAddress?: string | null; startDate?: string | null }
): ContractTemplate {
  const startDate = BIMED_DEFAULT_START_DATE;
  const employeeName = overrides?.employeeName?.trim() || 'Employee name to be confirmed before issue';
  const employeeAddress = overrides?.employeeAddress?.trim() || 'Employee address to be confirmed before issue';

  const roleSlug = template.roleSlug as CanonicalRecruitmentRoleSlug;
  const roleSalary = BIMED_ROLE_SALARIES[roleSlug];
  const permitCategory = permitCategoryForRole(roleSlug);
  const replacements: Array<[string, string]> = [
    ['[Insert employee name]', employeeName],
    ['[Employee full name]', employeeName],
    ['[Insert employee address]', employeeAddress],
    ['[Employee address]', employeeAddress],
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
    [' (currently EUR 32,691 per annum for Healthcare Assistant / Home Support Worker roles)', permitFloorNoteForRole(roleSlug)],
  ];

  if (roleSalary) replacements.push(['[Insert pay rate for this role]', roleSalary]);

  if (roleSlug === 'healthcare-assistant') {
    replacements.push([
      'EUR 32,691 gross per annum minimum, equivalent to EUR 16.12 gross per hour based on a 39-hour working week',
      roleSalary ?? '€36,000 per annum',
    ]);
  }

  if (roleSlug === 'physiotherapist') {
    replacements.push([
      'EUR 45,514 to EUR 63,831 gross per annum, in line with the HSE-aligned Physiotherapist (staff grade) pay scale, based on experience',
      roleSalary ?? '€55,000 per annum',
    ]);
    replacements.push([
      'The Company will apply for a General Employment Permit on your behalf, valid from your start date.',
      'Where an employment permit is required for this Role, the Company\'s intended permit pathway is Critical Skills Employment Permit (CSEP), subject to DETE eligibility and final assessment. This statement does not guarantee permit eligibility or grant.',
    ]);
  }

  const editableFields = template.editableFields.map((field) => ({
    ...field,
    value: replaceText(field.value, replacements),
    note:
      field.label === 'Line manager'
        ? 'Bimed default reporting line: Dezou Maurice.'
        : field.label === 'Start date'
          ? `Canonical commencement date: ${BIMED_DEFAULT_START_DATE}.`
          : field.label === 'Pay'
            ? roleSalary ? `Agreed BIMED salary minimum: ${roleSalary}.` : field.note
            : field.label === 'Pay frequency'
              ? 'Bimed payroll frequency: monthly.'
              : field.note,
  }));

  if (!editableFields.some((field) => field.label === 'Contract duration')) {
    editableFields.push({
      label: 'Contract duration',
      value: BIMED_DEFAULT_CONTRACT_DURATION,
      note: 'BIMED contracts are fixed-term for two years from 11 January 2027 to 10 January 2029 unless a candidate-specific written variation expressly changes the term.',
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
    commencementSection.paragraphs.push(`2.6 Contract duration: ${BIMED_DEFAULT_CONTRACT_DURATION}. The fixed term ends on 10 January 2029 unless a candidate-specific written variation expressly changes the term.`);
  }

  if (permitCategory) {
    const rightToWorkSection = sections.find((section) => section.heading === '16. Right to Work');
    if (rightToWorkSection && !rightToWorkSection.paragraphs.some((paragraph) => paragraph.includes('Intended employment permit pathway:'))) {
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
