export type InterviewQuestion = {
  id: string;
  text: string;
  /** Which care-sector value or safeguarding category this question assesses. Shown to admins
   * reviewing answers, and used to group questions for the candidate. */
  category: string;
  /** Short context shown under the question to help the candidate answer well. */
  guidance?: string;
};

// ---------------------------------------------------------------------------
// First interview - written, completed immediately after the application form.
//
// Structured around the "6 Cs" values framework (Care, Compassion, Competence,
// Communication, Courage, Commitment) used across UK and Ireland care-sector recruitment,
// and person-centred care principles (dignity, choice, independence, privacy, respect).
// ---------------------------------------------------------------------------

/** Roles requiring CORU registration and clinical/allied-health scope, as distinct from the three
 * frontline care roles (Support Worker, Healthcare Assistant, Senior Support Worker). */
export function isClinicalRole(roleApplied: string | null | undefined): boolean {
  return (roleApplied || '').toLowerCase().includes('physio');
}

export const FIRST_INTERVIEW_COMMON_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'care_motivation',
    category: 'Care',
    text: 'Why do you want to work in the care sector, and why with Bimed Healthcare specifically?',
  },
  {
    id: 'compassion_example',
    category: 'Compassion',
    text: 'Describe a time you cared for or supported someone who was vulnerable, unwell or in distress. What did you do, and what was the outcome?',
    guidance: 'Give a specific example if you can: what the situation was, what you did, and how it turned out.',
  },
  {
    id: 'communication_scenario',
    category: 'Communication',
    text: 'How would you explain a change to someone\'s care routine to a service user who finds it hard to understand, or to their family?',
  },
  {
    id: 'courage_scenario',
    category: 'Courage',
    text: 'Describe a time you had to speak up about something at work you were not comfortable with, even though it was difficult to do so.',
  },
  {
    id: 'commitment_reliability',
    category: 'Commitment',
    text: 'Reliable attendance matters in care settings, including early, evening and weekend cover. How do you make sure you are reliable and on time?',
  },
  {
    id: 'stress_handling',
    category: 'Competence',
    text: 'How do you stay calm and professional when a work situation becomes stressful or upsetting?',
  },
  {
    id: 'person_centred_care',
    category: 'Person-centred care',
    text: "What does 'person-centred care' mean to you in practice?",
    guidance: 'Think about dignity, choice, independence, privacy and respect for the individual.',
  },
];

// Competence question for the three frontline care roles (Support Worker, Healthcare Assistant,
// Senior Support Worker).
export const FIRST_INTERVIEW_CARE_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'competence_personal_care',
    category: 'Competence',
    text: 'Are you comfortable carrying out personal care duties such as washing, dressing, toileting and feeding? Please explain your experience with this.',
  },
];

// Competence questions for the Physiotherapist (clinical/allied-health) role.
export const FIRST_INTERVIEW_CLINICAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'competence_clinical_assessment',
    category: 'Competence',
    text: "Describe your approach to assessing a service user's physical function and mobility, and developing a treatment or rehabilitation plan.",
  },
  {
    id: 'coru_standards_awareness',
    category: 'Professional standards',
    text: "What does compliance with CORU's Standards of Proficiency for Physiotherapists mean for how you practise day to day?",
    guidance: 'CORU is the statutory regulator for physiotherapists in Ireland - registration and its standards are a condition of practice.',
  },
];

// Additional questions for candidates already living in Ireland (living_in_ireland === 'Yes').
export const FIRST_INTERVIEW_LOCAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'local_driving',
    category: 'Availability',
    text: 'Do you hold a full driving licence and have access to your own vehicle?',
  },
  {
    id: 'local_travel_flexibility',
    category: 'Availability',
    text: 'Are you able to travel to different client homes or care facilities in the area, including early, late and weekend shifts?',
  },
];

// Additional questions for candidates applying from outside Ireland (living_in_ireland === 'No').
export const FIRST_INTERVIEW_INTERNATIONAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'intl_driving',
    category: 'Availability',
    text: 'Do you hold a driving licence?',
  },
  {
    id: 'intl_family_size',
    category: 'Relocation',
    text: 'What is the size of your immediate family (partner and/or dependants) who may relocate with you?',
  },
  {
    id: 'intl_migrating_alone',
    category: 'Relocation',
    text: 'Are you planning to relocate to Ireland alone, or with family or dependants?',
  },
  {
    id: 'intl_contacts_in_ireland',
    category: 'Relocation',
    text: 'Do you have any friends or family already living in Ireland?',
  },
  {
    id: 'intl_permit_awareness',
    category: 'Relocation',
    text: 'Are you aware of, and prepared for, the employment permit and relocation process required to work in Ireland?',
    guidance: 'This typically includes a General Employment Permit application and registering your right to work before your start date.',
  },
];

export function getFirstInterviewQuestions(
  livingInIreland: string | null | undefined,
  roleApplied?: string | null
): InterviewQuestion[] {
  const pathwayQuestions = livingInIreland === 'No' ? FIRST_INTERVIEW_INTERNATIONAL_QUESTIONS : FIRST_INTERVIEW_LOCAL_QUESTIONS;
  const competenceQuestions = isClinicalRole(roleApplied) ? FIRST_INTERVIEW_CLINICAL_QUESTIONS : FIRST_INTERVIEW_CARE_QUESTIONS;
  return [...FIRST_INTERVIEW_COMMON_QUESTIONS, ...competenceQuestions, ...pathwayQuestions];
}

// ---------------------------------------------------------------------------
// Audio interview segment - questions are read aloud (browser text-to-speech) and must be
// answered as a voice note. Each candidate gets 3 questions picked at random from this pool, so
// candidates don't all receive the same three - a lightweight, asynchronous version of the
// "one-way video interview" screening format already standard in healthcare hiring (e.g. AMN
// Healthcare's one-way video screen for nursing candidates).
// ---------------------------------------------------------------------------

export const AUDIO_INTERVIEW_QUESTION_POOL: InterviewQuestion[] = [
  {
    id: 'audio_tell_us_about_yourself',
    category: 'Motivation',
    text: 'Tell us about yourself and why you want to work in care with Bimed Healthcare.',
  },
  {
    id: 'audio_difficult_communication',
    category: 'Communication',
    text: 'Describe a time you had to communicate something difficult or sensitive to a service user or their family. How did you approach it?',
  },
  {
    id: 'audio_teamwork_example',
    category: 'Teamwork',
    text: "Tell us about a time you worked as part of a team to support someone's care. What was your role?",
  },
  {
    id: 'audio_dignity_independence',
    category: 'Person-centred care',
    text: "How do you make sure a service user's dignity, comfort and independence are respected during personal care?",
  },
  {
    id: 'audio_adapting_to_change',
    category: 'Adaptability',
    text: "Describe a time you had to adapt quickly to a change in a service user's needs or routine.",
  },
  {
    id: 'audio_difficult_emotional_situation',
    category: 'Resilience',
    text: 'Tell us about a time you dealt with a difficult or emotional situation at work. How did you handle it?',
  },
  {
    id: 'audio_building_trust',
    category: 'Relationship-building',
    text: 'How would you build trust with a new service user who is anxious or reluctant to accept help?',
  },
  {
    id: 'audio_noticed_health_change',
    category: 'Observation',
    text: "Describe a time you noticed something wrong with a service user's health or wellbeing, and what you did about it.",
  },
  {
    id: 'audio_disagree_with_manager',
    category: 'Professional judgement',
    text: "What would you do if you disagreed with a decision your manager made about a service user's care?",
  },
];

export const AUDIO_INTERVIEW_QUESTION_COUNT = 3;

/** Deterministic-per-call random pick, used once per candidate and then persisted with their draft. */
export function pickRandomAudioQuestionIds(count: number = AUDIO_INTERVIEW_QUESTION_COUNT): string[] {
  const shuffled = [...AUDIO_INTERVIEW_QUESTION_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((q) => q.id);
}

export function findAudioInterviewQuestion(id: string): InterviewQuestion | undefined {
  return AUDIO_INTERVIEW_QUESTION_POOL.find((q) => q.id === id);
}

export const FIRST_INTERVIEW_ALL_QUESTIONS: InterviewQuestion[] = [
  ...FIRST_INTERVIEW_COMMON_QUESTIONS,
  ...FIRST_INTERVIEW_CARE_QUESTIONS,
  ...FIRST_INTERVIEW_CLINICAL_QUESTIONS,
  ...FIRST_INTERVIEW_LOCAL_QUESTIONS,
  ...FIRST_INTERVIEW_INTERNATIONAL_QUESTIONS,
  ...AUDIO_INTERVIEW_QUESTION_POOL,
];

export function findFirstInterviewQuestion(id: string): InterviewQuestion | undefined {
  return FIRST_INTERVIEW_ALL_QUESTIONS.find((q) => q.id === id);
}

// ---------------------------------------------------------------------------
// Second interview - practical, safeguarding-led scenarios. Only sent to candidates Bimed is
// seriously considering after the written interview and application review.
//
// Categories follow HIQA's National Standards for Adult Safeguarding, which recognise physical,
// sexual, emotional/psychological and financial abuse, and neglect, as the categories of harm
// health and social care staff must be able to recognise and report.
// ---------------------------------------------------------------------------

// Safeguarding and professionalism scenarios that apply regardless of role.
export const SECOND_INTERVIEW_COMMON_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'colleague_abuse',
    category: 'Safeguarding - reporting duty',
    text: 'You witness a colleague being rough, dismissive or verbally abusive towards a service user. What do you do?',
    guidance: 'Tell us specifically who you would report this to, and how quickly.',
  },
  {
    id: 'unexplained_bruising',
    category: 'Safeguarding - physical abuse',
    text: "You notice unexplained bruising on a service user during personal care. What steps do you take?",
    guidance: 'Think about what you would record, who you would tell, and what you would avoid doing.',
  },
  {
    id: 'financial_exploitation',
    category: 'Safeguarding - financial abuse',
    text: 'You suspect a service user is being financially exploited by a family member or visitor. What do you do?',
  },
  {
    id: 'fall_alone',
    category: 'Emergency response',
    text: 'A service user falls in their home and you are the only staff member present. What is your immediate response?',
  },
  {
    id: 'keep_a_secret',
    category: 'Confidentiality and escalation',
    text: 'A service user asks you to keep a secret from your manager about something that concerns you. How do you handle this?',
  },
];

// Hands-on personal care scenarios for the three frontline care roles.
export const SECOND_INTERVIEW_CARE_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'medication_refusal',
    category: 'Medication management',
    text: 'A service user refuses to take their prescribed medication. What do you do?',
    guidance: 'Consider why they might be refusing, and what you would do versus what is not your decision to make.',
  },
  {
    id: 'dementia_aggression',
    category: 'Behavioural support',
    text: 'A service user living with dementia becomes agitated or aggressive during personal care. How do you respond?',
  },
  {
    id: 'refuses_washing',
    category: 'Dignity and choice',
    text: 'A service user refuses to be washed or bathed for several days. How do you approach this?',
  },
];

// Clinical scenarios for the Physiotherapist role.
export const SECOND_INTERVIEW_CLINICAL_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'exercise_programme_refusal',
    category: 'Clinical judgement',
    text: 'A service user refuses to participate in their prescribed exercise or rehabilitation programme. What do you do?',
  },
  {
    id: 'disagree_with_care_team',
    category: 'Professional judgement',
    text: "You disagree with another member of the care team's approach to a service user's mobility or treatment plan. How do you handle it?",
  },
  {
    id: 'unexpected_mobility_decline',
    category: 'Clinical judgement',
    text: "A service user's mobility or physical condition appears to be deteriorating unexpectedly. What do you do?",
  },
];

export function getSecondInterviewQuestions(roleApplied?: string | null): InterviewQuestion[] {
  const roleQuestions = isClinicalRole(roleApplied) ? SECOND_INTERVIEW_CLINICAL_QUESTIONS : SECOND_INTERVIEW_CARE_QUESTIONS;
  return [...SECOND_INTERVIEW_COMMON_QUESTIONS, ...roleQuestions];
}

export const SECOND_INTERVIEW_ALL_QUESTIONS: InterviewQuestion[] = [
  ...SECOND_INTERVIEW_COMMON_QUESTIONS,
  ...SECOND_INTERVIEW_CARE_QUESTIONS,
  ...SECOND_INTERVIEW_CLINICAL_QUESTIONS,
];

export function findSecondInterviewQuestion(id: string): InterviewQuestion | undefined {
  return SECOND_INTERVIEW_ALL_QUESTIONS.find((q) => q.id === id);
}
