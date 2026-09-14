import { CANONICAL_RECRUITMENT_ROLES } from './bimed-role-policy';

function getEnvValue(primary: string, fallback: string) {
  return process.env[primary]?.trim() || fallback;
}

export const recruitmentContacts = {
  ireland: getEnvValue('BIMED_LOCAL_RECRUITMENT_EMAIL', 'recruitment@bimedhealthcare.com'),
  overseas: getEnvValue('BIMED_OVERSEAS_RECRUITMENT_EMAIL', 'overseas@bimedhealthcare.com'),
  manager: getEnvValue('BIMED_MANAGER_EMAIL', 'manager@bimedhealthcare.com'),
  admin: getEnvValue('BIMED_ADMIN_EMAIL', 'info@bimedhealthcare.com'),
} as const;

export const countries = [
  'Ireland', 'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize',
  'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic',
  'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Congo (DRC)', 'Costa Rica', "Cote d'Ivoire",
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala',
  'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Laos',
  'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Madagascar',
  'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
  'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea',
  'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Lucia',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
  'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay',
  'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Other',
] as const;

export const recruitmentRoles = CANONICAL_RECRUITMENT_ROLES;

export const recruitmentStatuses = [
  'Submitted', 'Under Review', 'Interview', 'Selected', 'Offer Issued', 'Documents Awaiting', 'Permit Processing',
  'Visa/Immigration Processing', 'Onboarding', 'Hired', 'Rejected', 'Withdrawn',
] as const;

export const candidateSupportDocuments = [
  'Passport / identity document', 'CV', 'Qualification certificates', 'Training certificates',
  'Employment references', 'Evidence of previous employment',
  'Garda vetting or police / background documentation where requested', 'Driving licence', 'Other relevant documents',
] as const;

export const candidateStepTitles = [
  'Personal information', 'Position and availability', 'Experience and qualifications', 'Employment and references',
  'Ireland / international pathway', 'Written interview', 'Supporting documents', 'Review', 'Declaration',
] as const;

export const recruitmentStatusGroups = {
  new: ['Submitted'],
  active: ['Under Review', 'Interview', 'Selected', 'Offer Issued', 'Documents Awaiting', 'Permit Processing', 'Visa/Immigration Processing', 'Onboarding', 'Hired'],
  closed: ['Rejected', 'Withdrawn'],
} as const;

export const recruitmentCopy = {
  invitationOnly: 'This portal is invitation-only. Candidates cannot self-register.',
  supportingDocuments: 'Candidates do not upload supporting documents through this portal. They are instructed to email them separately.',
  internationalGuidance:
    'If you are applying from outside Ireland, Bimed will need to confirm your right to work and any required employment permit before a start date can be agreed.',
  privacyNotice: {
    heading: 'Privacy notice',
    summary:
      'Bimed will use the information you provide to assess your application, contact you about recruitment, verify eligibility and references, and manage recruitment records.',
    details: [
      "Your information may be shared with relevant Bimed recruitment and management staff, and with service providers acting on Bimed's behalf for the recruitment process.",
      'Bimed will keep personal data only for as long as necessary for recruitment, record-keeping and any legal or regulatory obligations.',
      'You can ask to access, correct, restrict or erase your information, or object to certain processing, by contacting Bimed.',
    ],
    contact: `For privacy questions, contact the Bimed administration team at ${recruitmentContacts.admin}.`,
  },
  declaration: {
    statement:
      'I confirm that the information I have provided is true, complete and accurate to the best of my knowledge. I understand that Bimed may verify the information and references I provide and may request pre-employment checks where relevant.',
    consent:
      'I agree that Bimed may process my application information for recruitment, assessment, onboarding, legal compliance and record-keeping purposes, in line with the privacy notice above.',
  },
  candidateConfirmation: { subject: 'Bimed Healthcare recruitment application received' },
  adminNotification: { subjectPrefix: 'New Bimed Healthcare application:' },
} as const;

export function getResendFromEmail() {
  const configuredValue = process.env.RESEND_FROM_EMAIL?.trim();
  if (!configuredValue) return 'Bimed Healthcare <noreply@bimedhealthcare.com>';
  if (configuredValue.includes('<')) return configuredValue;
  return `Bimed Healthcare <${configuredValue}>`;
}

export function isInternationalCandidate(input: {
  living_in_ireland?: string | null;
  country_of_residence?: string | null;
  current_country?: string | null;
  work_permission?: string | null;
  requires_employment_permit?: string | null;
  relocation_readiness?: string | null;
}) {
  if (input.living_in_ireland !== 'No') return false;
  return Boolean(input.current_country?.trim() && input.work_permission?.trim() && input.requires_employment_permit?.trim() && input.relocation_readiness?.trim());
}

export function isInternationalRoutingCandidate(input: { living_in_ireland?: string | null }) {
  return input.living_in_ireland === 'No';
}
