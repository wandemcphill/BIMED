import { contractTemplates, type ContractSection, type ContractSignatory } from '@/lib/contract-templates';

export type DocumentTemplate = {
  slug: string;
  documentTitle: string;
  roleLabel?: string;
  effectiveDate: string;
  intro: string;
  templateNotes: string[];
  sections: ContractSection[];
  signatory: ContractSignatory;
};

const section = (heading: string, paragraphs: string[], bullets?: string[]): ContractSection => ({
  heading,
  paragraphs,
  bullets,
});

const documentSignatory: ContractSignatory = {
  name: 'Dezou Maurice',
  title: 'Authorised Signatory, Bimed Healthcare Limited',
};

// Job descriptions are built from the same Schedule 2 / 2A content already drafted inside each
// role's contract template, so the two documents cannot drift out of sync with each other.
export const jobDescriptionTemplates: DocumentTemplate[] = contractTemplates.map((template) => {
  const schedule2 = template.schedules.find((s) => s.heading.startsWith('Schedule 2 -'));
  const schedule2A = template.schedules.find((s) => s.heading.startsWith('Schedule 2A'));

  return {
    slug: template.roleSlug,
    documentTitle: `Job Description - ${template.roleLabel}`,
    roleLabel: template.roleLabel,
    effectiveDate: template.effectiveDate,
    intro: 'Republic of Ireland - Care & Support Worker Roles',
    templateNotes: [
      'This job description is issued alongside the employment contract and Schedule 2 (Job Description) referenced in it.',
    ],
    sections: [
      section('Role Summary', [
        `Job title: ${template.roleLabel}`,
        `Role group: ${template.editableFields.find((f) => f.label === 'Role group')?.value ?? ''}`,
        `Reports to: [Insert line manager name/title]`,
        `Normal place of work: ${
          template.sections
            .find((s) => s.heading === '3. Place of Work')
            ?.paragraphs[0]?.replace('3.1 Your normal place of work is ', '')
            .replace(', and any other location the Company may reasonably require, given the nature of home and domiciliary care work.', '') ?? '[Insert work location]'
        }`,
      ]),
      ...(schedule2
        ? [
            section(
              schedule2.heading.replace('Schedule 2 - ', ''),
              schedule2.paragraphs.filter((p) => !p.startsWith('Job title:')),
              schedule2.bullets
            ),
          ]
        : []),
      ...(schedule2A ? [section(schedule2A.heading.replace('Schedule 2A - ', ''), schedule2A.paragraphs, schedule2A.bullets)] : []),
    ],
    signatory: documentSignatory,
  };
});

export function getJobDescriptionTemplate(slug: string) {
  return jobDescriptionTemplates.find((template) => template.slug === slug) ?? null;
}

export const employeeHandbookTemplate: DocumentTemplate = {
  slug: 'employee-handbook',
  documentTitle: 'Employee Handbook',
  effectiveDate: '18 August 2026',
  intro: 'Bimed Healthcare Limited - all care and support roles, Republic of Ireland',
  templateNotes: [
    'This handbook is referred to throughout the Contract of Employment and is kept consistent with it.',
  ],
  sections: [
    section('1. Introduction and Scope', [
      '1.1 This handbook applies to all employees of Bimed Healthcare Limited ("Bimed", "the Company", "we", "us"), regardless of role or work location.',
      '1.2 This handbook does not form part of your contract of employment, but sets out the policies and procedures the Company expects you to follow. Where this handbook and your contract conflict, your contract prevails.',
      '1.3 The Company may update this handbook from time to time to reflect changes in the law or in Company policy, and will notify you of any material change.',
    ]),
    section('2. Equality, Dignity and Anti-Bullying at Work', [
      '2.1 Bimed is committed to equality of opportunity for all employees and does not tolerate discrimination on any ground protected under the Employment Equality Acts 1998-2015 (gender, civil status, family status, sexual orientation, religion, age, disability, race, and membership of the Traveller community).',
      '2.2 Bullying, harassment and sexual harassment of any kind will not be tolerated, whether by managers, colleagues, clients or third parties. Any employee who believes they have experienced or witnessed bullying or harassment should raise it under the grievance procedure in Section 4, or informally with their line manager in the first instance.',
      '2.3 Complaints will be treated seriously, investigated promptly and impartially, and dealt with confidentially so far as possible.',
    ]),
    section('3. Attendance, Sick Leave and Punctuality', [
      '3.1 Reliable attendance is critical to client safety and care continuity. If you are unable to attend a shift, you must notify your line manager as early as possible and in any event before the start of your shift.',
      '3.2 Statutory sick leave entitlements are set out in your contract of employment (Clause 7). This handbook does not reduce any statutory entitlement.',
      '3.3 Persistent lateness or unauthorised absence may be addressed under the disciplinary procedure in Section 5.',
    ]),
    section('4. Grievance Procedure', [
      '4.1 If you have a concern about your employment, you are encouraged to raise it informally with your manager first.',
      '4.2 If the matter is not resolved informally, you may raise a formal grievance in writing to your manager. You will be given a fair hearing, may be accompanied by a colleague or trade union representative, and will receive a written outcome.',
      '4.3 If you are not satisfied with the outcome, you may appeal in writing to a more senior manager not involved in the original decision, within 5 working days of the outcome.',
      '4.4 This procedure follows the WRC Code of Practice on Grievance and Disciplinary Procedures (S.I. No. 146 of 2000).',
    ]),
    section('5. Disciplinary Procedure', [
      '5.1 The disciplinary procedure is progressive: an informal discussion; a formal investigation; a disciplinary hearing (at which you may be accompanied by a colleague or trade union representative); and, depending on the outcome, an oral warning, a written warning, a final written warning, or dismissal.',
      '5.2 You will always be told the allegation against you in writing, given a fair opportunity to respond before any decision is made, and given a right of appeal to a more senior manager not involved in the original decision.',
      '5.3 Certain conduct may be treated as gross misconduct, justifying summary dismissal after a fair process, including without limitation: theft or dishonesty; physical or verbal abuse of a client or colleague; serious breach of client safeguarding; being under the influence of alcohol or drugs while on duty; and serious breach of confidentiality.',
    ]),
    section('6. Safeguarding and Garda Vetting', [
      '6.1 All client-facing roles are subject to mandatory vetting under the National Vetting Bureau (Children and Vulnerable Persons) Acts 2012-2016. You must not begin unsupervised client-facing duties until vetting is complete.',
      '6.2 You must report any safeguarding concern about a client - including suspected abuse, neglect or self-neglect - to your line manager immediately, in line with the Company\'s safeguarding policy and, where applicable, HIQA and Tusla reporting obligations.',
    ]),
    section('7. Health and Safety', [
      '7.1 You must take reasonable care for your own safety and that of others, cooperate with the Company on health and safety matters, use any protective equipment provided, and report hazards, near misses, accidents and unsafe conditions without delay.',
      '7.2 Given the nature of care work, you must follow all manual handling, infection control and lone-working procedures notified to you.',
    ]),
    section('8. Confidentiality and Data Protection', [
      '8.1 You will have access to confidential and sensitive information, including client personal data and health information. You must keep this information strictly confidential, both during and after your employment.',
      '8.2 You must comply with the Company\'s data protection policy and Employee Privacy Notice at all times, and must report any actual or suspected data breach to the Company immediately.',
    ]),
    section('9. Uniform, Company Property and Conduct', [
      '9.1 Where the Company issues a uniform, you must wear it while on duty and keep it clean and presentable.',
      '9.2 Any equipment, keys, identification, uniform, or documentation given to you remains the Company\'s property and must be returned immediately on request or when your employment ends.',
      '9.3 You are expected to conduct yourself professionally at all times, including on social media, and must not post anything that could identify a client or breach confidentiality.',
    ]),
    section('10. Protected Disclosures (Whistleblowing)', [
      '10.1 You have the right to make a protected disclosure about relevant wrongdoing under the Protected Disclosures Act 2014 (as amended), without being penalised for doing so. Disclosures may be made to the Company\'s designated contact, info@bimedhealthcare.com.',
    ]),
    section('11. Acknowledgement', [
      'I confirm that I have received, read, and understood this Employee Handbook, and agree to comply with the policies set out in it.',
    ]),
  ],
  signatory: documentSignatory,
};
