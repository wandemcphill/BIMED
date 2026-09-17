import {
  derivePermitType,
  permitSubmissionLabel,
  permitTypeLabel,
  type PermitSubmissionRoute,
  type PermitType,
} from '@/lib/employment-permit-options';
import { normalizeRecruitmentRole, type CanonicalRecruitmentRole } from '@/lib/bimed-role-policy';

export type PermitChecklistAudience = 'candidate' | 'BIMED' | 'shared';

export interface PermitChecklistItem {
  id: string;
  title: string;
  detail: string;
  audience: PermitChecklistAudience;
  conditional?: boolean;
}

export interface PermitChecklist {
  role: CanonicalRecruitmentRole;
  permit_type: PermitType;
  permit_type_label: string;
  submission_route: PermitSubmissionRoute | null;
  submission_route_label: string;
  checklist_title: string;
  source_label: string;
  source_url: string;
  notes: string[];
  items: PermitChecklistItem[];
}

export const DETE_GENERAL_EMPLOYMENT_PERMIT_CHECKLIST_URL =
  'https://enterprise.gov.ie/en/Publications/Publication-files/General-Employment-Permits-Checklist.pdf';
export const DETE_HCA_EMPLOYMENT_PERMIT_CHECKLIST_URL =
  'https://enterprise.gov.ie/en/publications/publication-files/health-care-assistant-employment-permit-checklist.pdf';
export const DETE_CSEP_CHECKLIST_URL =
  'https://enterprise.gov.ie/en/Publications/Publication-files/Critical-Skills-Employment-Permits-Checklist.pdf';
export const CORU_PHYSIOTHERAPIST_REGISTRATION_URL =
  'https://www.coru.ie/health-and-social-care-professionals/registration/how-do-i-apply-for-registration/before-you-start-the-process-read/';

const commonEmployerItems: PermitChecklistItem[] = [
  {
    id: 'employer-details',
    title: 'Employer and company details',
    detail: 'Prepare BIMED legal/company details, business activity, EEA/UK/Swiss and non-EEA employee counts, relevant redundancy information and the named employment-permit contact.',
    audience: 'BIMED',
  },
  {
    id: 'employment-details',
    title: 'Employment details',
    detail: 'Prepare the job title, detailed duties, work location, proposed employment period/start date, and the qualifications, skills, knowledge or experience required for the role.',
    audience: 'shared',
  },
  {
    id: 'pay-details',
    title: 'Salary and working-hours details',
    detail: 'Prepare annual remuneration, hourly and weekly rates, weekly hours, and any salary deductions that must be declared in the application.',
    audience: 'shared',
  },
  {
    id: 'contract',
    title: 'Signed employment contract',
    detail: 'A contract signed by the employer and employee must be available for the permit application.',
    audience: 'shared',
  },
  {
    id: 'passport-photo',
    title: 'Passport and passport-style photo',
    detail: 'Prepare the candidate passport copy and passport-style photo. DETE states the passport should have sufficient remaining validity for the application type.',
    audience: 'candidate',
  },
  {
    id: 'residence-history',
    title: 'Residence, immigration and previous permission details',
    detail: 'Where applicable, prepare the candidate’s current immigration permission/visa details, Irish Residence Permit number and previous visa or employment history in the State.',
    audience: 'candidate',
    conditional: true,
  },
  {
    id: 'qualifications-experience',
    title: 'Candidate qualifications, skills and experience',
    detail: 'Prepare evidence matching the qualifications, skills, knowledge or experience stated for the role and the candidate’s actual background.',
    audience: 'candidate',
  },
  {
    id: 'agent-details',
    title: 'Agent or recruitment-agency details',
    detail: 'Where an agent/agency is involved in the permit application, prepare the agent name, address, email, telephone and contact-person details.',
    audience: 'shared',
    conditional: true,
  },
];

function permitPaymentItem(route: PermitSubmissionRoute | null): PermitChecklistItem {
  if (route === 'bimed_legal_team') {
    return {
      id: 'permit-payment',
      title: 'Permit submission and payment',
      detail: 'BIMED legal team submits the application and BIMED pays the employment-permit application fee. Under the selected BIMED route, the fee is not recovered from the employee through salary deduction or repayment.',
      audience: 'BIMED',
    };
  }

  if (route === 'candidate_or_agency') {
    return {
      id: 'permit-payment',
      title: 'Permit submission and payment',
      detail: 'The candidate or recruitment agency submits the application and pays the employment-permit application fee directly. Keep payer/contact details and payment evidence ready for the application.',
      audience: 'candidate',
    };
  }

  return {
    id: 'permit-payment',
    title: 'Permit submission and payment',
    detail: 'The permit payer follows the selected submission route. Choose either the candidate/recruitment-agency route or the BIMED legal-team route before finalising the application packet.',
    audience: 'shared',
  };
}

function gepItems(role: CanonicalRecruitmentRole, route: PermitSubmissionRoute | null): PermitChecklistItem[] {
  const items: PermitChecklistItem[] = [...commonEmployerItems, permitPaymentItem(route)];

  items.push({
    id: 'lmnt',
    title: 'Labour Market Needs Test (LMNT)',
    detail: 'For this GEP pathway, confirm the required labour-market advertising evidence, including the JobsIreland/EURES reference and the additional qualifying online advertisement, before the application is submitted.',
    audience: 'BIMED',
  });

  items.push({
    id: 'revenue-evidence',
    title: 'Employer Revenue evidence',
    detail: 'Prepare the Revenue Commissioners evidence of the employer’s monthly statutory return/payment within the period specified by the current GEP checklist.',
    audience: 'BIMED',
  });

  if (role === 'Healthcare Assistant') {
    items.push({
      id: 'hca-role-evidence',
      title: 'Healthcare Assistant role evidence',
      detail: 'Use the dedicated Health Care Assistant GEP checklist and ensure the candidate’s relevant qualification, skills and experience evidence matches the HCA role being applied for.',
      audience: 'shared',
    });
    items.push({
      id: 'hca-renewal-note',
      title: 'HCA renewal reminder',
      detail: 'DETE’s dedicated HCA checklist notes a relevant QQI Level 5 qualification requirement for an HCA renewal after two years. This is a renewal-stage item, not a universal initial-application document.',
      audience: 'BIMED',
      conditional: true,
    });
  } else {
    items.push({
      id: 'care-role-evidence',
      title: `${role} role evidence`,
      detail: `Prepare role-specific job, qualification, skills and experience evidence for the ${role} position. The current GEP checklist applies unless a more specific occupation checklist or statutory requirement applies to the actual occupation.`,
      audience: 'shared',
    });
  }

  return items;
}

function csepItems(route: PermitSubmissionRoute | null): PermitChecklistItem[] {
  return [
    ...commonEmployerItems,
    permitPaymentItem(route),
    {
      id: 'two-year-offer',
      title: 'Two-year employment offer',
      detail: 'Confirm that the proposed Critical Skills employment offer is for at least two years, as required by the CSEP pathway.',
      audience: 'shared',
    },
    {
      id: 'csep-qualification',
      title: 'Physiotherapy qualification and professional readiness',
      detail: 'Prepare evidence of the relevant physiotherapy qualification, skills and experience. For an international qualification, prepare the CORU recognition/registration evidence applicable to the candidate’s current stage.',
      audience: 'candidate',
    },
    {
      id: 'coru-registration',
      title: 'CORU registration / recognition evidence',
      detail: 'Physiotherapists are a CORU-regulated profession. Where applicable, prepare the current CORU registration status or international-qualification recognition evidence needed for registration/practice.',
      audience: 'candidate',
      conditional: true,
    },
    {
      id: 'csep-no-lmnt',
      title: 'LMNT status',
      detail: 'No Labour Market Needs Test is required for a Critical Skills Employment Permit application.',
      audience: 'BIMED',
    },
  ];
}

export function getPermitChecklist(
  roleValue: string | null | undefined,
  route: PermitSubmissionRoute | null = null,
): PermitChecklist | null {
  const role = normalizeRecruitmentRole(roleValue);
  if (!role) return null;

  const permitType = derivePermitType(role);
  if (!permitType) return null;

  const isPhysiotherapist = role === 'Physiotherapist';
  const items = isPhysiotherapist ? csepItems(route) : gepItems(role, route);
  const sourceUrl = isPhysiotherapist
    ? DETE_CSEP_CHECKLIST_URL
    : role === 'Healthcare Assistant'
      ? DETE_HCA_EMPLOYMENT_PERMIT_CHECKLIST_URL
      : DETE_GENERAL_EMPLOYMENT_PERMIT_CHECKLIST_URL;
  const sourceLabel = isPhysiotherapist
    ? 'DETE Critical Skills Employment Permit Checklist'
    : role === 'Healthcare Assistant'
      ? 'DETE Health Care Assistant GEP Checklist'
      : 'DETE General Employment Permit Checklist';

  const notes = [
    'This is an operational preparation checklist, not legal advice and not a guarantee that every listed item will be required in every case.',
    'The final application must follow the current DETE checklist, the candidate’s actual nationality/residence facts and the selected submission route.',
    `Derived permit pathway: ${permitTypeLabel(permitType)}.`,
    route ? `Submission route: ${permitSubmissionLabel(route)}.` : 'Submission route is not yet recorded; the payment task will update after route selection.',
  ];

  if (isPhysiotherapist) {
    notes.push('Physiotherapy registration is a separate professional-readiness track and should be coordinated with CORU where applicable.');
  }

  return {
    role,
    permit_type: permitType,
    permit_type_label: permitTypeLabel(permitType),
    submission_route: route,
    submission_route_label: route ? permitSubmissionLabel(route) : 'Choose submission route',
    checklist_title: `${role} · ${permitTypeLabel(permitType)} preparation checklist`,
    source_label: sourceLabel,
    source_url: sourceUrl,
    notes,
    items,
  };
}

export function checklistSourceForRole(roleValue: string | null | undefined): string | null {
  return getPermitChecklist(roleValue)?.source_url || null;
}
