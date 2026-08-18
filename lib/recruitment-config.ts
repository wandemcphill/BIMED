export const recruitmentContacts = {
  ireland: 'info@bimedhealthcare.com',
  overseas: 'overseas@bimedhealthcare.com',
} as const;

export const recruitmentRoles = [
  'Support Worker',
  'Healthcare Worker',
  'Healthcare Assistant',
  'Other',
] as const;

export const recruitmentStatuses = [
  'Submitted',
  'Under Review',
  'Interview',
  'Selected',
  'Offer Issued',
  'Documents Awaiting',
  'Permit Processing',
  'Visa/Immigration Processing',
  'Onboarding',
  'Rejected',
  'Withdrawn',
] as const;

export const candidateSupportDocuments = [
  'Passport / identity document',
  'CV',
  'Qualification certificates',
  'Training certificates',
  'Employment references',
  'Evidence of previous employment',
  'Police / background documentation where requested',
  'Driving licence',
  'Other relevant documents',
] as const;

export const candidateStepTitles = [
  'Personal information',
  'Position and availability',
  'Experience and qualifications',
  'Employment and references',
  'Ireland / international pathway',
  'Supporting documents',
  'Declaration',
] as const;

export const recruitmentStatusGroups = {
  new: ['Submitted'],
  active: ['Under Review', 'Interview', 'Selected', 'Offer Issued', 'Documents Awaiting', 'Permit Processing', 'Visa/Immigration Processing', 'Onboarding'],
  closed: ['Rejected', 'Withdrawn'],
} as const;

export const recruitmentCopy = {
  invitationOnly: 'This portal is invitation-only. Candidates cannot self-register.',
  supportingDocuments: 'Candidates do not upload supporting documents through this portal. They are instructed to email them separately.',
  internationalGuidance:
    'Where applicable, employment permit and immigration requirements must be satisfied before lawful commencement of employment.',
  candidateConfirmation: {
    subject: 'Bimed Healthcare application received',
  },
  adminNotification: {
    subjectPrefix: 'New Bimed Healthcare candidate application:',
  },
} as const;

export function isInternationalCandidate(input: {
  living_in_ireland?: string | null;
  country_of_residence?: string | null;
}) {
  return input.living_in_ireland === 'No' || (input.country_of_residence ? input.country_of_residence !== 'Ireland' : false);
}

export function supportingDocumentsEmail(input: {
  living_in_ireland?: string | null;
  country_of_residence?: string | null;
}) {
  return isInternationalCandidate(input) ? recruitmentContacts.overseas : recruitmentContacts.ireland;
}
