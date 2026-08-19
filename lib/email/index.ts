/**
 * Centralised transactional email service.
 *
 * Route handlers call these functions; they never touch the Resend SDK directly.
 * Every function is non-throwing so an email problem can never fail a recruitment write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getInternalRecruitmentRecipients,
  isInternationalCandidate,
  recruitmentContacts,
  supportingDocumentsEmail,
} from '../recruitment-config';
import {
  adminInterviewNotificationEmail,
  adminNewApplicationEmail,
  adminPasswordResetEmail,
  adminStatusChangeNotificationEmail,
  applicationReceivedEmail,
  applicationStatusUpdateEmail,
  interviewCancelledEmail,
  interviewInvitationEmail,
  interviewRescheduledEmail,
} from './templates';
import { sendTransactionalEmail, type SendResult } from './transport';

export { isEmailConfigured, maskEmail, isValidRecipient, __setEmailSenderForTests } from './transport';
export type { SendResult } from './transport';
export * from './templates';

/** Repeated identical status/interview notifications inside this window are suppressed. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export type ApplicationEmailRecord = {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role_applied?: string | null;
  country_of_residence?: string | null;
  living_in_ireland?: string | null;
  work_permission?: string | null;
  status?: string | null;
  submitted_at?: string | null;
};

export type InterviewEmailRecord = {
  id: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  location?: string | null;
  meeting_link?: string | null;
  interviewer?: string | null;
  candidate_instructions?: string | null;
};

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function adminRecordUrl(applicationId: string): string {
  return `${getAppUrl()}/admin/applications/${applicationId}`;
}

function submittedLabel(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Recruitment/admin staff addresses come from the existing BIMED_* configuration.
 * RECRUITMENT_ADMIN_EMAIL is an optional extra recipient for deployments that want a
 * dedicated inbox without changing the routing rules.
 */
function internalRecipients(application: ApplicationEmailRecord): string[] {
  const extra = process.env.RECRUITMENT_ADMIN_EMAIL?.trim();
  const configured = getInternalRecruitmentRecipients(application);

  return [...new Set(extra ? [...configured, extra] : configured)];
}

// ---------------------------------------------------------------------------
// Application submission
// ---------------------------------------------------------------------------

/**
 * Candidate confirmation plus internal notification for a newly submitted application.
 * Dedupe is keyed on the application id, so a replayed submission cannot double-send.
 */
export async function sendApplicationReceivedEmails(
  application: ApplicationEmailRecord,
  client?: SupabaseClient | null
): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const international = isInternationalCandidate(application);

  const candidate = await sendTransactionalEmail({
    to: application.email,
    content: applicationReceivedEmail({
      candidateName: application.full_name,
      role: application.role_applied,
      applicationId: application.id,
      supportingDocumentsEmail: supportingDocumentsEmail(application),
    }),
    emailType: 'application_received',
    dedupeKey: `application_received:${application.id}`,
    applicationId: application.id,
    client,
    replyTo: supportingDocumentsEmail(application),
  });

  const adminContent = adminNewApplicationEmail({
    candidateName: application.full_name,
    candidateEmail: application.email,
    phone: application.phone,
    role: application.role_applied,
    countryOfResidence: application.country_of_residence,
    pathway: international ? 'International' : 'Ireland-based',
    workPermission: application.work_permission,
    submittedLabel: submittedLabel(application.submitted_at),
    adminRecordUrl: adminRecordUrl(application.id),
    applicationId: application.id,
  });

  const internal = await Promise.all(
    internalRecipients(application).map((recipient) =>
      sendTransactionalEmail({
        to: recipient,
        content: adminContent,
        emailType: 'admin_new_application',
        dedupeKey: `admin_new_application:${application.id}:${recipient}`,
        applicationId: application.id,
        client,
        replyTo: application.email,
      })
    )
  );

  return { candidate, internal };
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

/**
 * Candidate-facing next steps per existing status value. Only statuses that are safe and
 * useful to tell a candidate about are listed; anything absent is treated as internal-only.
 */
const CANDIDATE_STATUS_GUIDANCE: Record<string, string> = {
  'Under Review': 'Your application is being reviewed by our recruitment team. No action is needed from you right now.',
  Interview: 'Our recruitment team will be in touch to arrange an interview. Watch for a separate invitation email.',
  Selected: 'You have been selected to move forward. Our recruitment team will contact you with the next steps.',
  'Offer Issued': 'An offer has been issued for your application. Please review the details we send you separately and respond to our recruitment team.',
  'Documents Awaiting':
    'We still need supporting documents from you. Please email them to our recruitment team, using your full name in the subject line.',
  'Permit Processing': 'Your employment permit application is in progress. We will update you as it moves forward.',
  'Visa/Immigration Processing': 'Your visa and immigration steps are in progress. We will update you as they move forward.',
  Onboarding: 'You are now in onboarding. Our team will confirm your start date, training and any remaining paperwork.',
  Rejected:
    'After careful consideration we will not be progressing your application on this occasion. We are grateful for your interest in Bimed Healthcare.',
  Withdrawn: 'Your application has been marked as withdrawn. If this is not correct, please contact our recruitment team.',
};

export function isCandidateNotifiableStatus(status: string): boolean {
  return Object.prototype.hasOwnProperty.call(CANDIDATE_STATUS_GUIDANCE, status);
}

/**
 * Notifies the candidate that their status changed, and tells internal staff.
 * 'Submitted' is intentionally not notifiable: the application-received email covers it.
 */
export async function sendApplicationStatusUpdateEmails(
  input: {
    application: ApplicationEmailRecord;
    previousStatus: string;
    status: string;
    actor: string;
    notifyCandidate?: boolean;
  },
  client?: SupabaseClient | null
): Promise<{ candidate: SendResult | null; internal: SendResult[] }> {
  const { application, status, previousStatus } = input;
  const notifyCandidate = input.notifyCandidate !== false && isCandidateNotifiableStatus(status);

  const candidate = notifyCandidate
    ? await sendTransactionalEmail({
        to: application.email,
        content: applicationStatusUpdateEmail({
          candidateName: application.full_name,
          role: application.role_applied,
          applicationId: application.id,
          status,
          nextSteps: CANDIDATE_STATUS_GUIDANCE[status],
        }),
        emailType: 'application_status_update',
        dedupeKey: `application_status_update:${application.id}:${status}`,
        dedupeWindowMs: DUPLICATE_WINDOW_MS,
        applicationId: application.id,
        client,
        replyTo: supportingDocumentsEmail(application),
      })
    : null;

  const adminContent = adminStatusChangeNotificationEmail({
    candidateName: application.full_name,
    role: application.role_applied,
    applicationId: application.id,
    previousStatus,
    status,
    actor: input.actor,
    adminRecordUrl: adminRecordUrl(application.id),
  });

  const internal = await Promise.all(
    internalRecipients(application).map((recipient) =>
      sendTransactionalEmail({
        to: recipient,
        content: adminContent,
        emailType: 'admin_status_change',
        dedupeKey: `admin_status_change:${application.id}:${status}:${recipient}`,
        dedupeWindowMs: DUPLICATE_WINDOW_MS,
        applicationId: application.id,
        client,
      })
    )
  );

  return { candidate, internal };
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

type InterviewEmailInput = {
  application: ApplicationEmailRecord;
  interview: InterviewEmailRecord;
  previousScheduledAt?: string | null;
  reason?: string | null;
  /** Distinguishes repeat notifications for the same interview (reschedule count). */
  revision?: number;
};

export async function sendInterviewInvitationEmails(
  input: InterviewEmailInput,
  client?: SupabaseClient | null
): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;

  const candidate = await sendTransactionalEmail({
    to: application.email,
    content: interviewInvitationEmail({
      candidateName: application.full_name,
      role: application.role_applied,
      applicationId: application.id,
      scheduledAt: interview.scheduled_at,
      durationMinutes: interview.duration_minutes,
      location: interview.location,
      meetingLink: interview.meeting_link,
      interviewer: interview.interviewer,
      instructions: interview.candidate_instructions,
    }),
    emailType: 'interview_invitation',
    dedupeKey: `interview_invitation:${interview.id}`,
    applicationId: application.id,
    client,
    replyTo: recruitmentContacts.ireland,
  });

  const internal = await sendInterviewAdminNotifications('scheduled', input, client);

  return { candidate, internal };
}

export async function sendInterviewRescheduledEmails(
  input: InterviewEmailInput,
  client?: SupabaseClient | null
): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;

  const candidate = await sendTransactionalEmail({
    to: application.email,
    content: interviewRescheduledEmail({
      candidateName: application.full_name,
      role: application.role_applied,
      applicationId: application.id,
      scheduledAt: interview.scheduled_at,
      previousScheduledAt: input.previousScheduledAt,
      durationMinutes: interview.duration_minutes,
      location: interview.location,
      meetingLink: interview.meeting_link,
      interviewer: interview.interviewer,
      instructions: interview.candidate_instructions,
    }),
    emailType: 'interview_rescheduled',
    dedupeKey: `interview_rescheduled:${interview.id}:${input.revision ?? 0}`,
    applicationId: application.id,
    client,
    replyTo: recruitmentContacts.ireland,
  });

  const internal = await sendInterviewAdminNotifications('rescheduled', input, client);

  return { candidate, internal };
}

export async function sendInterviewCancelledEmails(
  input: InterviewEmailInput,
  client?: SupabaseClient | null
): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;

  const candidate = await sendTransactionalEmail({
    to: application.email,
    content: interviewCancelledEmail({
      candidateName: application.full_name,
      role: application.role_applied,
      applicationId: application.id,
      scheduledAt: interview.scheduled_at,
      reason: input.reason,
    }),
    emailType: 'interview_cancelled',
    dedupeKey: `interview_cancelled:${interview.id}`,
    applicationId: application.id,
    client,
    replyTo: recruitmentContacts.ireland,
  });

  const internal = await sendInterviewAdminNotifications('cancelled', input, client);

  return { candidate, internal };
}

async function sendInterviewAdminNotifications(
  action: 'scheduled' | 'rescheduled' | 'cancelled',
  input: InterviewEmailInput,
  client?: SupabaseClient | null
): Promise<SendResult[]> {
  const { application, interview } = input;

  const content = adminInterviewNotificationEmail({
    action,
    candidateName: application.full_name,
    role: application.role_applied,
    applicationId: application.id,
    scheduledAt: interview.scheduled_at,
    location: interview.location,
    interviewer: interview.interviewer,
    adminRecordUrl: adminRecordUrl(application.id),
  });

  return Promise.all(
    internalRecipients(application).map((recipient) =>
      sendTransactionalEmail({
        to: recipient,
        content,
        emailType: 'admin_interview_update',
        dedupeKey: `admin_interview_${action}:${interview.id}:${input.revision ?? 0}:${recipient}`,
        applicationId: application.id,
        client,
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Admin password reset
// ---------------------------------------------------------------------------

/**
 * The reset URL contains the single-use token, so it is never logged and never persisted
 * anywhere except the outbound email body.
 */
export async function sendAdminPasswordResetEmail(
  input: { to: string; displayName: string; resetUrl: string; expiryMinutes: number },
  client?: SupabaseClient | null
): Promise<SendResult> {
  return sendTransactionalEmail({
    to: input.to,
    content: adminPasswordResetEmail({
      displayName: input.displayName,
      resetUrl: input.resetUrl,
      expiryMinutes: input.expiryMinutes,
    }),
    emailType: 'admin_password_reset',
    client,
    replyTo: recruitmentContacts.admin,
  });
}
