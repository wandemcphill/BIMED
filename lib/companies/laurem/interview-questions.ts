import type { InterviewQuestion } from '@/lib/interview-questions';

/**
 * Laurem-specific interview programme.
 *
 * This file intentionally contains business content only. The reusable interview
 * UI, answer storage, token handling and admin review remain in the core engine.
 */

export type LauremNursePathway = 'uk' | 'international';

export const LAUREM_NURSE_COMMON_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'laurem_nurse_about_you',
    category: 'Professional background',
    text: 'Tell us about yourself and your nursing experience. What areas of nursing have you worked in?',
  },
  {
    id: 'laurem_nurse_why_laurem',
    category: 'Motivation',
    text: 'Why do you want to work for Laurem Caregroup, and what interests you about this nursing role?',
  },
  {
    id: 'laurem_nurse_person_centred_care',
    category: 'Person-centred care',
    text: "What does person-centred care mean to you, and how do you protect a service user's dignity, choice, privacy and independence?",
  },
  {
    id: 'laurem_nurse_safeguarding',
    category: 'Safeguarding',
    text: 'What would you do if you suspected that a service user was being abused, neglected or otherwise put at risk?',
  },
  {
    id: 'laurem_nurse_medication_safety',
    category: 'Clinical safety',
    text: 'Tell us about the checks and professional judgement you use to keep medication administration safe.',
  },
  {
    id: 'laurem_nurse_deterioration',
    category: 'Clinical judgement',
    text: "You notice that a service user's condition is deteriorating. How would you assess the situation, escalate concerns and communicate with the wider team?",
  },
  {
    id: 'laurem_nurse_infection_control',
    category: 'Infection prevention',
    text: 'What practical steps do you take every day to reduce the risk of infection and protect service users, colleagues and yourself?',
  },
  {
    id: 'laurem_nurse_documentation',
    category: 'Professional practice',
    text: 'Why is accurate, timely and confidential clinical documentation important? Give an example of what good record keeping looks like.',
  },
  {
    id: 'laurem_nurse_teamwork',
    category: 'Teamwork',
    text: 'Tell us about a time you worked with carers, support workers or other professionals to improve a service user\'s care. What was your role?',
  },
  {
    id: 'laurem_nurse_conflict',
    category: 'Communication',
    text: 'Describe a time when you disagreed with a colleague about a patient or service user\'s care. How did you handle the disagreement?',
  },
  {
    id: 'laurem_nurse_prioritisation',
    category: 'Clinical judgement',
    text: 'You have several competing clinical tasks and more than one service user needs your attention. How do you prioritise what to do first?',
  },
  {
    id: 'laurem_nurse_consent_capacity',
    category: 'Consent and choice',
    text: 'How would you respond when a service user refuses care or treatment? What factors would you consider before deciding what to do next?',
  },
  {
    id: 'laurem_nurse_emergency',
    category: 'Emergency response',
    text: 'Describe how you would respond to an unexpected clinical emergency while working with limited immediate support.',
  },
  {
    id: 'laurem_nurse_delegation',
    category: 'Leadership',
    text: 'How do you safely delegate tasks to support workers or carers while remaining accountable for the care you provide?',
  },
  {
    id: 'laurem_nurse_resilience',
    category: 'Resilience',
    text: 'Care work can be emotionally demanding. Tell us about a difficult situation at work and how you remained professional and effective.',
  },
];

export const LAUREM_NURSE_UK_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'laurem_nurse_uk_right_to_work',
    category: 'Eligibility',
    text: 'What is your current right-to-work status in the UK, and is there anything Laurem would need to know about your permission to work?',
  },
  {
    id: 'laurem_nurse_uk_local_experience',
    category: 'UK practice',
    text: 'What experience do you have working in the UK health or social care system?',
  },
];

export const LAUREM_NURSE_INTERNATIONAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'laurem_nurse_intl_current_country',
    category: 'International pathway',
    text: 'Which country are you currently living and working in, and what is your current nursing role?',
  },
  {
    id: 'laurem_nurse_intl_registration',
    category: 'Professional registration',
    text: 'What is your current nursing registration status, including any UK registration or registration process already underway?',
    guidance: 'Tell us what you have already completed and what, if anything, remains outstanding.',
  },
  {
    id: 'laurem_nurse_intl_uk_transition',
    category: 'UK transition',
    text: 'What do you expect will be different about practising nursing in the UK compared with your current country, and how would you prepare for that transition?',
  },
  {
    id: 'laurem_nurse_intl_relocation',
    category: 'Relocation',
    text: 'If offered the role, how ready are you to relocate to the UK, and what arrangements would you need to make before starting work?',
  },
  {
    id: 'laurem_nurse_intl_dependants',
    category: 'Relocation',
    text: 'Would you be relocating alone or with dependants, and are there any family or practical considerations that may affect your relocation timeline?',
  },
  {
    id: 'laurem_nurse_intl_uk_care',
    category: 'Adaptability',
    text: 'How would you adapt to working within a new healthcare system, new policies and a multidisciplinary team in the UK?',
  },
  {
    id: 'laurem_nurse_intl_sponsorship',
    category: 'Sponsorship pathway',
    text: 'What is your understanding of the employer-sponsored work and relocation process, and what information or support would you expect from Laurem during that process?',
  },
];

export const LAUREM_NURSE_AUDIO_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'laurem_audio_nurse_introduction',
    category: 'Motivation',
    text: 'In no more than two minutes, introduce yourself, summarise your nursing experience and explain why you want to join Laurem Caregroup.',
  },
  {
    id: 'laurem_audio_nurse_safeguarding',
    category: 'Safeguarding',
    text: 'Tell us about a time you recognised a safeguarding concern or a risk to a vulnerable person. What did you do?',
  },
  {
    id: 'laurem_audio_nurse_deterioration',
    category: 'Clinical judgement',
    text: 'Describe a time you noticed a patient or service user deteriorating. How did you respond and who did you involve?',
  },
  {
    id: 'laurem_audio_nurse_teamwork',
    category: 'Teamwork',
    text: 'Tell us about a challenging situation where you had to work closely with other healthcare professionals to achieve a good outcome.',
  },
  {
    id: 'laurem_audio_nurse_dignity',
    category: 'Person-centred care',
    text: 'How do you protect dignity and respect when providing intimate or personal care?',
  },
  {
    id: 'laurem_audio_nurse_medication',
    category: 'Clinical safety',
    text: 'Describe a time you identified or prevented a medication-related risk. What did you do?',
  },
  {
    id: 'laurem_audio_nurse_adaptation',
    category: 'Adaptability',
    text: 'Tell us about a time you had to adapt your nursing practice quickly because a patient\'s needs changed.',
  },
  {
    id: 'laurem_audio_nurse_international',
    category: 'International pathway',
    text: 'For an overseas applicant: what attracts you to nursing in the UK, and what do you think will be your biggest adjustment when you relocate?',
  },
];

export const LAUREM_NURSE_SECOND_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'laurem_nurse_second_unexplained_injury',
    category: 'Safeguarding scenario',
    text: 'During a home visit, you notice unexplained bruising on a service user. The service user appears uncomfortable discussing it. Talk us through your response from the moment you notice the concern.',
  },
  {
    id: 'laurem_nurse_second_medication_refusal',
    category: 'Clinical scenario',
    text: 'A service user refuses essential medication and becomes distressed when you encourage them to take it. How would you manage the situation?',
  },
  {
    id: 'laurem_nurse_second_deterioration',
    category: 'Clinical scenario',
    text: 'A service user who was stable earlier becomes acutely unwell. What observations would you make, how would you prioritise your actions and when would you escalate?',
  },
  {
    id: 'laurem_nurse_second_family_concern',
    category: 'Communication scenario',
    text: 'A family member says they are unhappy with the care being provided and becomes confrontational. How would you respond while maintaining confidentiality and professional boundaries?',
  },
  {
    id: 'laurem_nurse_second_care_plan',
    category: 'Care planning',
    text: 'You believe a service user\'s current care plan no longer reflects their needs. What would you do?',
  },
  {
    id: 'laurem_nurse_second_staff_concern',
    category: 'Leadership scenario',
    text: 'A support worker reports a concern but another colleague tells them not to raise it because it will create problems for the team. What would you do?',
  },
  {
    id: 'laurem_nurse_second_error',
    category: 'Professional accountability',
    text: 'You realise you have made or nearly made a clinical error. What are your immediate responsibilities and how would you prevent a recurrence?',
  },
  {
    id: 'laurem_nurse_second_priorities',
    category: 'Prioritisation scenario',
    text: 'Three competing issues arise at the same time: a medication concern, a distressed service user and a colleague asking for routine assistance. Explain your priority order and why.',
  },
];

export function getLauremNurseFirstInterviewQuestions(pathway: LauremNursePathway): InterviewQuestion[] {
  return [
    ...LAUREM_NURSE_COMMON_QUESTIONS,
    ...(pathway === 'international' ? LAUREM_NURSE_INTERNATIONAL_QUESTIONS : LAUREM_NURSE_UK_QUESTIONS),
  ];
}

export function getLauremNurseSecondInterviewQuestions(): InterviewQuestion[] {
  return LAUREM_NURSE_SECOND_INTERVIEW_QUESTIONS;
}

export function getLauremNurseAudioQuestions(): InterviewQuestion[] {
  return LAUREM_NURSE_AUDIO_QUESTIONS;
}
