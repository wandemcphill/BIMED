export type ContractField = {
  label: string;
  value: string;
  note?: string;
};

export type ContractSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type ContractTemplate = {
  roleSlug: string;
  roleLabel: string;
  documentTitle: string;
  effectiveDate: string;
  intro: string;
  templateNotes: string[];
  howToUse: string[];
  editableFields: ContractField[];
  sections: ContractSection[];
  schedules: ContractSection[];
  closingNote: string;
};

const section = (heading: string, paragraphs: string[], bullets?: string[]): ContractSection => ({
  heading,
  paragraphs,
  bullets,
});

function buildTemplate(roleLabel: string, roleSlug: string, roleGroup: string): ContractTemplate {
  return {
    roleSlug,
    roleLabel,
    documentTitle: 'Contract of Employment - Template',
    effectiveDate: '18 August 2026',
    intro: 'Republic of Ireland - Care & Support Worker Roles - Drafted 18 August 2026',
    templateNotes: [
      'This is a working template, not a finished, signable contract.',
      'Fields shown in bracketed text need to be completed or confirmed by Bimed before use.',
      'It is built around the statutory minimum entitlements that apply in Ireland today and standard care-sector practice.',
      'SOLICITOR REVIEW RECOMMENDED: Bimed should have an Irish employment solicitor review and sign off the final version before issue, especially Clause 24 and Schedule 1.',
      'Irish law requires a Day 5 Statement of core terms within 5 days of an employee starting work, and the fuller statement within 1 month. In practice, most employers issue the full contract on or before day one.',
    ],
    howToUse: [
      'Every fill-in-the-blank is wrapped in square brackets and highlighted on screen. Complete or confirm each one for the role or employee before issue, and remove the brackets once filled in.',
      'This template is designed to satisfy the Terms of Employment (Information) Acts 1994-2015, as amended by the Employment (Miscellaneous Provisions) Act 2018 and the European Union (Transparent and Predictable Working Conditions) Regulations 2022.',
      'Replace the bracketed fields below before issue and keep the final signed copy on file.',
    ],
    editableFields: [
      { label: 'Employee name', value: '[Insert employee name]', note: 'Replace with the employee full legal name.' },
      { label: 'Employee address', value: '[Insert employee address]', note: 'Use the employee residential address.' },
      { label: 'Job title', value: roleLabel, note: 'Use the agreed role title.' },
      { label: 'Line manager', value: '[Insert line manager name/title]', note: 'Replace with the reporting line.' },
      { label: 'Start date', value: '[Insert start date]', note: 'Confirm the commencement date.' },
      { label: 'Work location', value: '[Insert work location]', note: 'Use the normal place of work or main client area.' },
      { label: 'Contracted hours', value: '[XX hours per week]', note: 'Confirm the weekly hours before issue.' },
      { label: 'Pay', value: '[Insert pay rate]', note: 'Add hourly or annual pay as agreed.' },
      { label: 'Pay frequency', value: '[weekly / fortnightly / monthly]', note: 'Choose the actual payroll cycle.' },
      { label: 'Role group', value: roleGroup, note: 'Internal role grouping for this template.' },
    ],
    sections: [
      section('Part A - Core Contract of Employment', [
        'This Contract of Employment is made between Bimed Healthcare Limited (Company Registration No. 587415), of 169 Castlemoyne, Dublin 13, Dublin, D13 X3C6, Ireland ("the Company", "Bimed", "we", "us"), and [Employee full name] of [Employee address] ("you", "the Employee").',
        'This contract, together with the Employee Handbook and any policy referred to in it, sets out your terms and conditions of employment.',
      ]),
      section('1. Job Title, Duties and Reporting', [
        `1.1 Your job title is ${roleLabel} ("the Role").`,
        '1.2 You will report to [line manager name/title], or such other person as the Company may notify to you.',
        '1.3 Your duties are set out in Schedule 2 (Job Description) to this contract. The Company may reasonably amend your duties from time to time, consistent with your role, skills and grade, and will notify you of any material change in writing.',
        "1.4 You must carry out your duties to a professional and safe standard, consistent with Bimed's policies, relevant professional and regulatory standards, and the individual care plan of each client to whom you are assigned.",
        '1.5 You must not carry out any duty outside the scope of your training, competence or role, including: [list any duties workers must not perform - e.g. administering injections, driving a client\'s own vehicle, handling a client\'s bank cards or PIN unsupervised].',
      ]),
      section('2. Commencement of Employment and Probation', [
        '2.1 Your employment begins on [start date] ("the Commencement Date").',
        '2.2 The first 6 months of your employment is a probationary period, during which your performance, conduct and suitability for the Role will be assessed.',
        '2.3 The Company may, in exceptional circumstances and where it is in your interest, extend your probationary period once, up to a combined maximum of 12 months. You will be told in writing of any extension and the reasons for it before the original probationary period ends.',
        '2.4 During probation, either party may end this contract by giving the notice set out in Clause 11 (Notice and Termination). Where the reason for ending your employment during probation relates to conduct or performance, the Company will still tell you the reason and give you a fair opportunity to respond, even where the full procedure in Clause 13 is not followed in full.',
        '2.5 The Company will confirm the successful completion of your probation to you in writing.',
      ]),
      section('3. Place of Work', [
        '3.1 Your normal place of work is [client homes / Bimed office address] within the [Dublin / Cork / Limerick] area, and any other location the Company may reasonably require, given the nature of home and domiciliary care work.',
        '3.2 You may be required to travel between client locations in the course of your duties. [Confirm whether a mileage/travel allowance applies, and at what rate.]',
      ]),
      section('4. Hours of Work', [
        '4.1 Your normal working hours are [XX hours per week], as set out in your work schedule, which may include early, late, weekend and night/sleepover shifts [if applicable].',
        '4.2 Your hours of work will not exceed an average of 48 hours per week, calculated over a 4-month reference period, in accordance with the Organisation of Working Time Act 1997.',
        '4.3 You are entitled to a 15-minute break where you have worked more than 4.5 hours, and a 30-minute break (which may include the first) where you have worked more than 6 hours. You are entitled to 11 consecutive hours\' rest in each 24-hour period, and 24 consecutive hours\' rest (preceded by the 11-hour daily rest) in each 7-day period.',
        '4.4 Where your work pattern is wholly or mostly unpredictable, the Company will give you reasonable notice - at least 24 hours where reasonably practicable - of any work assignment. You may refuse a work assignment given with less than 24 hours\' notice, without penalty, except in genuine emergencies.',
        '4.5 Where the Company cancels a scheduled work assignment with less than 24 hours\' notice, you may be entitled to compensation under the Organisation of Working Time Act 1997 (as amended).',
        '4.6 If, over a 12-month reference period, the hours you actually work do not reflect the hours set out in this contract, you may be entitled to request to be placed in a band of hours that better reflects your actual pattern of work, under the Employment (Miscellaneous Provisions) Act 2018.',
        '4.7 Overtime: [state Company overtime policy and rate, if any] - there is no statutory entitlement to overtime pay in Ireland, so this is the Company\'s choice.',
      ]),
      section('5. Remuneration', [
        '5.1 Your pay is [EUR __ per hour / EUR __ per annum], payable [weekly / fortnightly / monthly] by bank transfer, on or before the [Xth] of each pay period.',
        '5.2 Where you hold an employment permit for this Role, your pay will not be reduced below the minimum salary required to keep that permit valid (currently EUR 32,691 per annum for Healthcare Assistant / Home Support Worker roles) - see also Schedule 1.',
        '5.3 The Company will deduct PAYE, PRSI and USC as required by law. No other deduction will be made from your pay without your prior written consent, except as permitted by the Payment of Wages Act 1991.',
        '5.4 Pay will be reviewed [annually / at the Company\'s discretion], but the Company does not guarantee any increase.',
      ]),
      section('6. Annual Leave and Public Holidays', [
        '6.1 Your annual leave entitlement is 4 working weeks (20 days) [or the Company\'s chosen higher amount] per leave year (1 January - 31 December), accruing in proportion to hours worked, under the Organisation of Working Time Act 1997.',
        '6.2 You are entitled to the 10 public holidays currently recognised in Ireland (New Year\'s Day, St Brigid\'s Day, St Patrick\'s Day, Easter Monday, the first Mondays of May, June and August, the October Bank Holiday, Christmas Day and St Stephen\'s Day). Where you are required to work on a public holiday, you will receive, at the Company\'s discretion, an additional day\'s pay, a paid day off in lieu, or an extra day of annual leave.',
        '6.3 Annual leave requests must be submitted with at least [X] weeks\' notice and are subject to the Company\'s approval, taking account of client care needs and staffing levels.',
        '6.4 Untaken annual leave may not normally be carried over beyond the leave year, except where required by law (for example, due to illness or other statutory leave).',
      ]),
      section('7. Sick Leave', [
        '7.1 If you are unable to attend work due to illness, you must notify [manager/office contact] as early as possible, and in any event before [shift start time], and provide a medical certificate for absences of more than [X] days, or as otherwise required by the Company.',
        '7.2 Provided you have at least 13 weeks of continuous service, you are entitled to statutory sick leave under the Sick Leave Act 2022: currently 5 paid sick days per calendar year, paid at 70% of normal daily earnings, capped at EUR 110 per day, and subject to medical certification.',
        '7.3 [Confirm whether the Company offers only the statutory scheme above, or additional contractual sick pay - insert details.]',
        '7.4 Given the nature of care work, you must not attend work, or attend a client, while suffering from an illness that could put a client at risk, and must follow the Company\'s infection control policy.',
      ]),
      section('8. Other Statutory Leave', [
        '8.1 You may also be entitled to maternity, paternity, parental, adoptive, carer\'s, force majeure, domestic violence, and other statutory leave, in accordance with the relevant legislation in force from time to time. Details are available from [Office/HR contact] or in the Employee Handbook.',
      ]),
      section('9. Pension', [
        '9.1 [Confirm the Company\'s current pension position - e.g. participation in the State\'s Automatic Enrolment Retirement Savings System once commenced, and/or any existing Company pension scheme.]',
      ]),
      section('10. Training', [
        '10.1 The Company will provide any mandatory training you need to safely and lawfully carry out your Role (which may include manual handling, safeguarding, medication management, infection control, and any QQI-related training). Where such training is legally required for your job, it will be provided free of charge, will count as working time, and will be paid - and will take place during working hours where possible.',
        '10.2 You must complete all mandatory training within the timeframe notified to you and keep your certifications current.',
      ]),
      section('11. Notice and Termination', [
        '11.1 After probation, the notice you must give the Company to resign is 1 week [or Company\'s chosen longer period]. The minimum notice the Company must give you, based on your length of continuous service, is set out below (Minimum Notice and Terms of Employment Acts 1973-2005).',
        '11.2 The Company may end your employment without notice or payment in lieu, in cases of gross misconduct, following a fair disciplinary process (see Clause 13).',
        '11.3 The Company may choose to pay you in lieu of notice, at its discretion.',
        '11.4 Where your right to work depends on an employment permit, your employment will also end automatically if that permit lapses, is revoked, or is not renewed - see Schedule 1.',
      ]),
      section('12. Confidentiality', [
        '12.1 In the course of your employment you will have access to confidential and sensitive information, including client personal data, health information, care plans, and Company business information. You must keep all such information strictly confidential, both during and after your employment, and must not disclose it except as needed to perform your duties, with proper authorisation, or as required by law.',
        '12.2 Your confidentiality obligations continue indefinitely after your employment ends, for as long as the information remains confidential.',
        '12.3 Nothing in this clause stops you making a protected disclosure in good faith under the Protected Disclosures Act 2014 (as amended), or cooperating with HIQA, Tusla, An Garda Siochana, or any other statutory body in the exercise of their functions.',
      ]),
      section('13. Disciplinary and Grievance Procedure', [
        '13.1 The Company\'s full disciplinary and grievance procedures are set out in the Employee Handbook, which forms part of your terms of employment and follows the WRC Code of Practice on Grievance and Disciplinary Procedures (S.I. No. 146 of 2000). You will be given a copy within 28 days of starting work.',
        '13.2 In summary, the disciplinary procedure is progressive and may involve: an informal discussion; a formal investigation; a disciplinary hearing (at which you may be accompanied by a colleague or trade union representative); and, depending on the outcome, an oral warning, a written warning, a final written warning, or dismissal. You will always be told the allegation against you in writing, given a fair opportunity to respond, and given a right of appeal to a more senior manager not involved in the original decision.',
        '13.3 Certain conduct may be treated as gross misconduct, justifying summary dismissal after a fair process, including without limitation: theft or dishonesty; physical or verbal abuse of a client or colleague; serious breach of client safeguarding; being under the influence of alcohol or drugs while on duty; and serious breach of confidentiality.',
        '13.4 If you have a grievance about your employment, raise it informally with your manager first; if it is not resolved, raise it formally in writing under the Company\'s grievance procedure in the Employee Handbook.',
      ]),
      section('14. Data Protection', [
        '14.1 The Company processes your personal data as data controller, under the GDPR and the Data Protection Act 2018, for purposes connected with your employment - including payroll, performance management, and compliance with legal obligations such as Garda vetting and, where relevant, employment permit compliance. Full details are in the Company\'s Employee Privacy Notice, provided to you separately.',
        '14.2 You must comply with the Company\'s data protection policy at all times, including in relation to client personal data and special category data such as health information, and must report any actual or suspected data breach to [Office/DPO contact] immediately.',
      ]),
      section('15. Health and Safety', [
        '15.1 The Company will take all reasonably practicable steps to protect your safety, health and welfare at work, under the Safety, Health and Welfare at Work Act 2005.',
        '15.2 You must take reasonable care for your own safety and that of others affected by your acts or omissions, cooperate with the Company on health and safety matters, use any protective equipment provided, and report hazards, near misses, accidents and unsafe conditions without delay.',
        '15.3 Given the nature of care work, you must follow all manual handling, infection control and lone-working procedures notified to you.',
      ]),
      section('16. Right to Work', [
        '16.1 Your employment is conditional on you having, and continuing to hold, the right to work in Ireland for the duration of your employment. You must give the Company satisfactory evidence of your right to work before your start date, and must tell the Company immediately of any change in your immigration status.',
        '16.2 If you need an employment permit to work in this Role, Schedule 1 to this contract applies in addition to these terms.',
      ]),
      section('17. Garda Vetting', [
        '17.1 This Role involves regular contact with vulnerable persons and is subject to mandatory vetting under the National Vetting Bureau (Children and Vulnerable Persons) Acts 2012-2016. Your employment, and its continuation, is conditional on a satisfactory vetting disclosure and, for candidates who have lived outside Ireland, a satisfactory police clearance certificate from each relevant country. You must not begin unsupervised client-facing duties until vetting is complete.',
        '17.2 You must tell the Company immediately of any criminal charge, caution, or conviction arising during your employment that may be relevant to your role.',
      ]),
      section('18. References', [
        '18.1 Your employment is conditional on the Company receiving satisfactory references, which you consented to as part of your application.',
        '18.2 On request, the Company will provide a factual reference to a prospective employer once your employment ends, generally limited to dates of employment, job title, and, where you consent, attendance and conduct.',
      ]),
      section('19. Company Property and Uniform', [
        '19.1 Any equipment, keys, identification, uniform, or documentation given to you remains the Company\'s property and must be returned immediately on request or when your employment ends.',
        '19.2 [Insert uniform/dress code details, if any apply.]',
      ]),
      section('20. Outside Employment (Parallel Employment)', [
        '20.1 Under the European Union (Transparent and Predictable Working Conditions) Regulations 2022, the Company will not stop you taking up other employment outside your work schedule with the Company.',
        '20.2 However, given the safety-critical and confidential nature of care work, you must tell the Company in advance of any other employment, and the Company may object on reasonable, objective grounds - including risk to client safety, conflicts of interest, breach of confidentiality, or a risk that your combined working hours would breach the Organisation of Working Time Act 1997.',
      ]),
      section('21. Right to Request More Predictable Working Conditions', [
        '21.1 Once you have completed your probationary period and have at least 6 months of continuous service, you may ask to move to a form of employment with more predictable and/or secure working conditions (for example, from part-time to full-time hours), where such a role is available. The Company will give you a reasoned, written reply within one month, and you may make this request once in any 12-month period.',
      ]),
      section('22. Equality and Dignity at Work', [
        '22.1 The Company is committed to equality of opportunity and does not discriminate on any ground protected under the Employment Equality Acts 1998-2015 (gender, civil status, family status, sexual orientation, religion, age, disability, race, and membership of the Traveller community). The Company\'s Dignity at Work / anti-bullying and harassment policy is set out in the Employee Handbook.',
      ]),
      section('23. Protected Disclosures', [
        '23.1 You have the right to make a protected disclosure about relevant wrongdoing under the Protected Disclosures Act 2014 (as amended by the Protected Disclosures (Amendment) Act 2022), without being penalised for doing so. Details of the Company\'s reporting channels are in the Employee Handbook.',
      ]),
      section('24. Restrictive Covenant (Non-Solicitation of Clients)', [
        'DRAFTING NOTE - SOLICITOR REVIEW RECOMMENDED: The enforceability of any post-termination restriction depends on it protecting a genuine, legitimate business interest and being no wider than reasonably necessary in duration, geography and scope. This clause should be reviewed by a solicitor and tailored to the specific role before use, and may not be appropriate, or worth including, for lower-paid, non-managerial roles.',
        '24.1 For [3-6] months after your employment ends, you must not solicit or accept the business of any Bimed client you personally provided care to in the 6 months before your employment ended, other than in a purely personal capacity unconnected with any new employer or agency.',
      ]),
      section('25. Variation', [
        '25.1 The Company may make reasonable changes to your terms of employment from time to time (for example, to reflect changes in the law, client needs, or business requirements), and will notify you of any material change in writing, in accordance with the Terms of Employment (Information) Acts 1994-2015.',
      ]),
      section('26. General', [
        '26.1 This contract, together with the Employee Handbook and any policy referred to in it, is the entire agreement between you and the Company about your employment, and replaces any prior discussion or agreement.',
        '26.2 If any clause of this contract is found unenforceable, the remaining clauses continue to apply.',
        '26.3 This contract is governed by the laws of Ireland, and the Irish courts and the Workplace Relations Commission have jurisdiction over any dispute arising from it.',
      ]),
    ],
    schedules: [
      section('Schedule 1 - Additional Terms for Employment Permit Holders (Overseas Employees)', [
        'This Schedule applies in addition to, and does not replace, the main body of this contract, where your right to work in Ireland depends on an employment permit.',
        '1. Your employment, and its continuation, is conditional on you holding a valid employment permit for this Role at all times. The Company [will apply for / has applied for] a General Employment Permit on your behalf, valid from [date] to [date].',
        '2. You must not start work until your employment permit has been granted and you have given the Company a copy of it.',
        '3. The salary in Clause 5 will not be reduced below the minimum salary the Department of Enterprise, Tourism and Employment requires to keep your permit valid (currently EUR 32,691 per annum for this Role).',
        '4. The Company will not deduct the cost of your employment permit application or any recruitment fees from your pay, and will not retain your personal documents, including your passport, in accordance with Irish employment permit law.',
        '5. You must tell the Company immediately of any change to your immigration status, and must apply for a permit renewal in good time before it expires, with the Company\'s assistance.',
        '6. If your employment permit is refused, revoked, or not renewed, or if you otherwise cease to hold the right to work in Ireland, your employment will end automatically, and the Company will pay you any notice or entitlements due to you up to that date, in accordance with law.',
        '7. If Bimed provides a relocation expense reimbursement under its relocation policy, this is set out separately in the Relocation Policy / Offer Letter and is conditional on the terms set out there, including successful completion of your probationary period.',
        '8. This Schedule does not itself guarantee permit renewal or sponsorship of any future permit; these remain subject to the Company\'s ongoing business needs and Irish immigration law and policy in force at the relevant time.',
      ]),
      section('Schedule 2 - Job Description', [
        'Job title: [insert]     Reports to: [insert]',
        'Main duties may include:',
      ], [
        'Personal care support',
        'Meal preparation, cooking and menu planning',
        'Medication management support',
        'Mobility and moving/handling assistance',
        'Domestic duties and light housekeeping',
        'Companionship and support accessing social/leisure activities',
        'Supporting cultural or religious needs',
        'Helping maintain family and community connections',
        'Supporting access to education and employment, and promoting independence (Supported Living clients)',
        'Assisting with, but not directly handling, a client\'s bills and finances, in line with the Company\'s safeguarding policy',
      ]),
      section('Schedule 2A - Role-Specific Notes', [
        '[Insert: minimum experience required, mandatory training/qualifications, any duties the employee must NOT perform, and any driving requirement.]',
      ]),
      section('Schedule 3 - Quick-Reference Compliance Checklist', [
        "For Bimed's internal use before issuing any contract:",
      ], [
        'Day 5 Statement of core terms issued within 5 days of start date (can be this full contract, issued on or before day 1)',
        'Garda vetting / police clearance completed and satisfactory before unsupervised client contact begins',
        'For overseas hires: employment permit granted and copy on file before start date',
        'Salary meets the relevant minimum - National Minimum Wage for local hires, or the higher employment-permit salary floor for sponsored roles',
        'Employee Handbook (including full disciplinary/grievance procedure) given to the employee within 28 days of starting',
        'Employee Privacy Notice provided separately',
        'References received and satisfactory',
        'Contract signed and countersigned copy retained on file',
      ]),
    ],
    closingNote:
      'Employee acknowledgement: I confirm that I have received, read, and understood this contract of employment (including Schedule 1, where it applies) and the Employee Handbook referred to in it.',
  };
}

export const contractTemplates: ContractTemplate[] = [
  buildTemplate(
    'Support Worker',
    'support-worker',
    'Frontline care role'
  ),
  buildTemplate(
    'Healthcare Assistant',
    'healthcare-assistant',
    'Clinical support role'
  ),
  buildTemplate(
    'Senior Support Worker',
    'senior-support-worker',
    'Senior frontline care role'
  ),
];

export function getContractTemplate(roleSlug: string) {
  return contractTemplates.find((template) => template.roleSlug === roleSlug) ?? null;
}
