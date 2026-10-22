export type SocClassification = {
  code: string;
  occupation: string;
  display: string;
  sourceUrl: string;
  note: string;
};

const DETE_CLASSIFICATION_URL =
  'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/classification-of-employments/';
const DETE_CRITICAL_SKILLS_URL =
  'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/highly-skilled-eligible-occupations-list/critical%20skills%20occupations%20list.html';
const DETE_INELIGIBLE_LIST_URL =
  'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/ineligible-categories-of-employment/ineligible%20list%20of%20occupations%20.html';

const CLASSIFICATIONS: Array<{ matches: RegExp; classification: SocClassification }> = [
  {
    matches: /\b(physiotherapist|physiotherapy|physio)\b/i,
    classification: {
      code: '2221',
      occupation: 'Physiotherapist',
      display: 'SOC 2010 2221 — Physiotherapist',
      sourceUrl: DETE_CRITICAL_SKILLS_URL,
      note: 'Mapped from the application role to SOC 2010. DETE lists Physiotherapist under SOC-4 2221 on the Critical Skills Occupations List. Final classification and permit eligibility remain subject to the actual duties and DETE assessment.',
    },
  },
  {
    matches: /\b(healthcare assistant|health care assistant|hca|nursing auxiliary|nursing assistant)\b/i,
    classification: {
      code: '6141',
      occupation: 'Nursing auxiliaries and assistants',
      display: 'SOC 2010 6141 — Nursing auxiliaries and assistants',
      sourceUrl: DETE_CLASSIFICATION_URL,
      note: 'Mapped from the application role to the closest SOC 2010 occupation label. Confirm the actual role duties fit nursing auxiliary/assistant work before employment-permit submission; DETE makes the final classification.',
    },
  },
  {
    matches: /\b(senior support worker|senior care worker)\b/i,
    classification: {
      code: '6146',
      occupation: 'Senior care workers',
      display: 'SOC 2010 6146 — Senior care workers',
      sourceUrl: DETE_INELIGIBLE_LIST_URL,
      note: 'Mapped from the application role to SOC 2010. DETE currently lists SOC-4 6146 as ineligible except for senior care workers in disability services; confirm the actual service setting and permit eligibility before submission.',
    },
  },
  {
    matches: /\bsupport worker\b/i,
    classification: {
      code: '3239',
      occupation: 'Other welfare and housing associate professionals (Support Worker)',
      display: 'SOC 2010 3239 — Support Worker',
      sourceUrl: DETE_INELIGIBLE_LIST_URL,
      note: 'Mapped from the application role to SOC 2010. DETE identifies Support Worker as an exception within SOC-4 3239 on the current Ineligible List; the actual duties and permit eligibility still require confirmation.',
    },
  },
];

export function getSocClassification(roleApplied: string | null | undefined): SocClassification | null {
  const role = (roleApplied || '').replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!role) return null;
  return CLASSIFICATIONS.find(({ matches }) => matches.test(role))?.classification ?? null;
}

/**
 * Returns true only when a valid application DOB makes the person at least 18
 * on the proposed employment start date. DOBs are date-only ISO strings to
 * avoid timezone-dependent age calculations.
 */
export function isAdultAtEmploymentStart(
  dateOfBirth: string | null | undefined,
  employmentStartDate: string | null | undefined,
): boolean {
  if (!dateOfBirth || !employmentStartDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !/^\d{4}-\d{2}-\d{2}$/.test(employmentStartDate)) return false;

  const dob = new Date(dateOfBirth + 'T00:00:00Z');
  const start = new Date(employmentStartDate + 'T00:00:00Z');
  if (Number.isNaN(dob.getTime()) || Number.isNaN(start.getTime())) return false;
  if (dob.toISOString().slice(0, 10) !== dateOfBirth || start.toISOString().slice(0, 10) !== employmentStartDate) return false;
  if (dob > start) return false;

  let age = start.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = start.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && start.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 18;
}
