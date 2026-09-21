import type { SupabaseClient } from '@supabase/supabase-js';

export const BIMED_RECRUITMENT_STATUSES = [
  'Submitted',
  'Under Review',
  'Interview',
  'Selected',
  'Offer Issued',
  'Documents Awaiting',
  'Permit Processing',
  'Visa/Immigration Processing',
  'Onboarding',
  'Hired',
  'Rejected',
  'Withdrawn',
] as const;

export type BimedRecruitmentStatus = (typeof BIMED_RECRUITMENT_STATUSES)[number];

export class BimedLifecycleError extends Error {
  constructor(
    public readonly code: 'APPLICATION_NOT_FOUND' | 'INVALID_RECRUITMENT_STATUS' | 'STATUS_TRANSITION_BLOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'BimedLifecycleError';
  }
}

export function isBimedRecruitmentStatus(value: string | null | undefined): value is BimedRecruitmentStatus {
  return BIMED_RECRUITMENT_STATUSES.includes(value as BimedRecruitmentStatus);
}

export const BIMED_STATUS_TRANSITIONS: Record<BimedRecruitmentStatus, readonly BimedRecruitmentStatus[]> = {
  Submitted: ['Under Review', 'Interview', 'Rejected', 'Withdrawn'],
  'Under Review': ['Interview', 'Documents Awaiting', 'Rejected', 'Withdrawn'],
  Interview: ['Selected', 'Documents Awaiting', 'Offer Issued', 'Rejected', 'Withdrawn'],
  Selected: ['Offer Issued', 'Documents Awaiting', 'Onboarding', 'Rejected', 'Withdrawn'],
  'Offer Issued': ['Documents Awaiting', 'Onboarding', 'Rejected', 'Withdrawn'],
  'Documents Awaiting': ['Permit Processing', 'Onboarding', 'Rejected', 'Withdrawn'],
  'Permit Processing': ['Visa/Immigration Processing', 'Onboarding', 'Rejected', 'Withdrawn'],
  'Visa/Immigration Processing': ['Onboarding', 'Rejected', 'Withdrawn'],
  Onboarding: ['Hired', 'Rejected', 'Withdrawn'],
  Hired: [],
  Rejected: [],
  Withdrawn: [],
};

export function localBimedTransitionAllowed(current: BimedRecruitmentStatus, next: BimedRecruitmentStatus) {
  return current === next || BIMED_STATUS_TRANSITIONS[current].includes(next);
}

export function getBimedStatusOptions(current: string): string[] {
  if (!isBimedRecruitmentStatus(current)) return [current];
  return [current, ...BIMED_STATUS_TRANSITIONS[current]];
}

export async function transitionBimedApplicationStatus(
  client: SupabaseClient,
  input: {
    applicationId: string;
    toStatus: BimedRecruitmentStatus;
    actor: string;
    note?: string | null;
  },
) {
  const { data, error } = await client.rpc('bimed_transition_application_status', {
    p_application_id: input.applicationId,
    p_to_status: input.toStatus,
    p_actor: input.actor,
    p_note: input.note || null,
  });

  if (error || !data) {
    const message = error?.message || 'Unable to transition the application.';
    if (message.includes('APPLICATION_NOT_FOUND')) {
      throw new BimedLifecycleError('APPLICATION_NOT_FOUND', 'Application not found.');
    }
    if (message.includes('INVALID_RECRUITMENT_STATUS')) {
      throw new BimedLifecycleError('INVALID_RECRUITMENT_STATUS', 'Invalid recruitment status.');
    }
    if (message.includes('STATUS_TRANSITION_BLOCKED')) {
      throw new BimedLifecycleError('STATUS_TRANSITION_BLOCKED', error?.details || 'The requested recruitment status transition is not permitted.');
    }
    throw error || new Error(message);
  }

  return data;
}


export async function scheduleBimedInterview(
  client: SupabaseClient,
  input: {
    applicationId: string;
    scheduledAt: string;
    durationMinutes: number | null;
    location: string | null;
    meetingLink: string | null;
    interviewer: string | null;
    candidateInstructions: string | null;
    actor: string;
  },
) {
  const { data, error } = await client.rpc('bimed_schedule_recruitment_interview', {
    p_application_id: input.applicationId,
    p_scheduled_at: input.scheduledAt,
    p_duration_minutes: input.durationMinutes,
    p_location: input.location,
    p_meeting_link: input.meetingLink,
    p_interviewer: input.interviewer,
    p_candidate_instructions: input.candidateInstructions,
    p_actor: input.actor,
  });

  if (error || !data) {
    const message = error?.message || 'Unable to schedule the interview.';
    if (message.includes('APPLICATION_NOT_FOUND')) {
      throw new BimedLifecycleError('APPLICATION_NOT_FOUND', 'Application not found.');
    }
    if (message.includes('STATUS_TRANSITION_BLOCKED')) {
      throw new BimedLifecycleError('STATUS_TRANSITION_BLOCKED', error?.details || 'The application cannot move to Interview from its current status.');
    }
    throw error || new Error(message);
  }

  return data;
}
