export type ContractClauseSection = {
  heading: string;
  paragraphs: string[];
};

export type ContractTemplate = {
  roleSlug: string;
  roleLabel: string;
  documentTitle: string;
  effectiveDate: string;
  intro: string;
  contractDetails: Array<{
    label: string;
    value: string;
  }>;
  overviewPoints: string[];
  clauseSections: ContractClauseSection[];
};

const commonClauses: ContractClauseSection[] = [
  {
    heading: 'Employment status',
    paragraphs: [
      'This template is for a Bimed Healthcare employment offer or contract draft and must be reviewed before issue.',
      'Insert the final employment status, probation wording and any conditional start requirements here.',
    ],
  },
  {
    heading: 'Pay, hours and scheduling',
    paragraphs: [
      'Insert the agreed contracted hours, pay rate, pay frequency, rota expectations and any overtime or unsocial-hours provisions here.',
      'Confirm whether the role is full-time, part-time, fixed-term or flexible before using the final document.',
    ],
  },
  {
    heading: 'Duties and reporting',
    paragraphs: [
      'Insert the agreed role duties, reporting line and any location-specific responsibilities here.',
      'If the role includes travel, on-call duties or shift coverage, add the relevant wording here.',
    ],
  },
  {
    heading: 'Confidentiality and conduct',
    paragraphs: [
      'Insert the confidentiality, data protection, professionalism, safeguarding and code-of-conduct wording approved by Bimed here.',
      'Add reference to any policy documents or staff handbook sections if Bimed wishes to incorporate them by reference.',
    ],
  },
  {
    heading: 'Termination and policies',
    paragraphs: [
      'Insert notice periods, termination rights, disciplinary process references and policy incorporation wording here.',
      'Ensure any final clause set is reviewed against Irish employment law before issue.',
    ],
  },
];

function buildTemplate(roleLabel: string, roleSlug: string, intro: string, detailLabel: string): ContractTemplate {
  return {
    roleSlug,
    roleLabel,
    documentTitle: `${roleLabel} Employment Contract Template`,
    effectiveDate: 'To be confirmed',
    intro,
    contractDetails: [
      { label: 'Employee name', value: '[Insert employee name]' },
      { label: 'Job title', value: roleLabel },
      { label: 'Start date', value: '[Insert start date]' },
      { label: 'Work location', value: '[Insert work location]' },
      { label: 'Role group', value: detailLabel },
      { label: 'Review status', value: 'Draft for Bimed review' },
    ],
    overviewPoints: [
      'Use this layout as the approved letterhead shell.',
      'Insert Bimed-approved legal terms before issue.',
      'Keep the employment terms configurable until final management sign-off.',
    ],
    clauseSections: [
      ...commonClauses,
      {
        heading: 'Role-specific notes',
        paragraphs: [
          `Insert any ${roleLabel.toLowerCase()}-specific duties, standards, competencies or rota arrangements here.`,
          'If the role has special training, supervision, equipment or client-contact requirements, list them in this section.',
        ],
      },
    ],
  };
}

export const contractTemplates: ContractTemplate[] = [
  buildTemplate(
    'Support Worker',
    'support-worker',
    'Draft support worker contract shell for Bimed review. Use this template when preparing an offer for a support worker role.',
    'Frontline care role'
  ),
  buildTemplate(
    'Healthcare Assistant',
    'healthcare-assistant',
    'Draft healthcare assistant contract shell for Bimed review. Use this template when preparing an offer for a healthcare assistant role.',
    'Clinical support role'
  ),
  buildTemplate(
    'Senior Support Worker',
    'senior-support-worker',
    'Draft senior support worker contract shell for Bimed review. Use this template when preparing an offer for a senior support worker role.',
    'Senior frontline care role'
  ),
];

export function getContractTemplate(roleSlug: string) {
  return contractTemplates.find((template) => template.roleSlug === roleSlug) ?? null;
}
