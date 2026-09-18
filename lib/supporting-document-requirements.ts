import { recruitmentRoleSlug } from '@/lib/bimed-role-policy';

export const SUPPORTING_DOCUMENT_LABELS: Record<string, string> = {
  passport: 'Passport or approved identity evidence',
  address: 'Current address evidence',
  cv: 'Current CV',
  employment: 'Previous employment and reference details',
  qualifications: 'Qualification certificates',
  registration: 'Professional registration/licence evidence',
  training: 'Relevant training certificates',
  other: 'Any additional documents specifically requested by BIMED',
};

const BASE_REQUIRED_KEYS = [
  'passport',
  'address',
  'cv',
  'employment',
  'qualifications',
  'training',
  'other',
] as const;

export function supportingDocumentRequirements(roleApplied: string | null | undefined) {
  const roleSlug = recruitmentRoleSlug(roleApplied);
  const registrationRequired = roleSlug === 'physiotherapist';
  const keys = registrationRequired
    ? [...BASE_REQUIRED_KEYS.slice(0, 5), 'registration', ...BASE_REQUIRED_KEYS.slice(5)]
    : [...BASE_REQUIRED_KEYS];

  return {
    roleSlug,
    registrationRequired,
    keys,
    labels: keys.map((key) => ({ key, label: SUPPORTING_DOCUMENT_LABELS[key] ?? key })),
  };
}

export function missingSupportingDocuments(
  roleApplied: string | null | undefined,
  checked: unknown,
) {
  const selected = new Set(Array.isArray(checked) ? checked.filter((value): value is string => typeof value === 'string') : []);
  const requirements = supportingDocumentRequirements(roleApplied);
  return requirements.labels.filter((item) => !selected.has(item.key));
}
