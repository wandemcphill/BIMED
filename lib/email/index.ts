import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isInternationalRoutingCandidate,
  recruitmentContacts,
  recruitmentInternalRecipients,
  supportingDocumentsEmail,
} from '../recruitment-config';
import {
  adminContractSignedEmail,
  adminDocumentSignedEmail,
  adminInterviewNotificationEmail,
  adminNewApplicationEmail,
  adminPasswordResetEmail,
  adminStatusChangeNotificationEmail,
  applicationReceivedEmail,
  applicationStatusUpdateEmail,
  contractReadyToSignEmail,
  documentReadyToSignEmail,
  adminSecondInterviewCompletedEmail,
  interviewCancelledEmail,
  interviewInvitationEmail,
  interviewRescheduledEmail,
  onboardingPackEmail,
  recruitmentInviteEmail,
  secondInterviewInviteEmail,
} from './templates';
import { sendTransactionalEmail, type SendResult } from './transport';

export { isEmailConfigured, maskEmail, isValidRecipient, __setEmailSenderForTests } from './transport';
export type { SendResult } from './transport';
export * from './templates';

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

export async function sendRecruitmentInviteEmail(input: { inviteId: string; candidateEmail: string; candidateName?: string | null; role?: string | null; applyUrl: string; expiresLabel?: string | null }, client?: SupabaseClient | null): Promise<SendResult> {
  return sendTransactionalEmail({ to: input.candidateEmail, content: recruitmentInviteEmail({ candidateName: input.candidateName, role: input.role, applyUrl: input.applyUrl, expiresLabel: input.expiresLabel }), emailType: 'recruitment_invite', dedupeKey: `recruitment_invite:${input.inviteId}`, client, replyTo: recruitmentContacts.ireland });
}

export async function sendApplicationReceivedEmails(application: ApplicationEmailRecord, client?: SupabaseClient | null): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const international = isInternationalRoutingCandidate(application);
  const candidate = await sendTransactionalEmail({ to: application.email, content: applicationReceivedEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, supportingDocumentsEmail: supportingDocumentsEmail(application) }), emailType: 'application_received', dedupeKey: `application_received:${application.id}`, applicationId: application.id, client, replyTo: supportingDocumentsEmail(application) });
  const adminContent = adminNewApplicationEmail({ candidateName: application.full_name, candidateEmail: application.email, phone: application.phone, role: application.role_applied, countryOfResidence: application.country_of_residence, pathway: international ? 'International' : 'Ireland-based', workPermission: application.work_permission, submittedLabel: submittedLabel(application.submitted_at), adminRecordUrl: adminRecordUrl(application.id), applicationId: application.id });
  const internal = await Promise.all(recruitmentInternalRecipients(international).map((recipient) => sendTransactionalEmail({ to: recipient, content: adminContent, emailType: 'admin_new_application', dedupeKey: `admin_new_application:${application.id}:${recipient}`, applicationId: application.id, client, replyTo: application.email })));
  return { candidate, internal };
}

const CANDIDATE_STATUS_GUIDANCE: Record<string, string> = {
  'Under Review': 'Your application is being reviewed by our recruitment team. No action is needed from you right now.',
  Interview: 'Our recruitment team will be in touch to arrange an interview. Watch for a separate invitation email.',
  Selected: 'You have been selected to move forward. Our recruitment team will contact you with the next steps.',
  'Offer Issued': 'An offer has been issued for your application. Please review the details we send you separately and respond to our recruitment team.',
  'Documents Awaiting': 'We still need supporting documents from you. Please email them to our recruitment team, using your full name in the subject line.',
  'Permit Processing': 'Your employment permit application is in progress. We will update you as it moves forward.',
  'Visa/Immigration Processing': 'Your visa and immigration steps are in progress. We will update you as they move forward.',
  Onboarding: 'You are now in onboarding. Our team will confirm your start date, training and any remaining paperwork.',
  Hired: 'Congratulations. You are now a BIMED employee. Your staff account is ready. Use the activation link in this email to create your password and access the BIMED Staff Portal.',
  Rejected: 'After careful consideration we will not be progressing your application on this occasion. We are grateful for your interest in Bimed Healthcare.',
  Withdrawn: 'Your application has been marked as withdrawn. If this is not correct, please contact our recruitment team.',
};

export function isCandidateNotifiableStatus(status: string): boolean { return Object.prototype.hasOwnProperty.call(CANDIDATE_STATUS_GUIDANCE, status); }

export async function sendApplicationStatusUpdateEmails(input: { application: ApplicationEmailRecord; previousStatus: string; status: string; actor: string; notifyCandidate?: boolean }, client?: SupabaseClient | null): Promise<{ candidate: SendResult | null; internal: SendResult[] }> {
  const { application, status, previousStatus } = input;
  const notifyCandidate = input.notifyCandidate !== false && isCandidateNotifiableStatus(status);
  const international = isInternationalRoutingCandidate(application);
  const candidate = notifyCandidate ? await sendTransactionalEmail({ to: application.email, content: applicationStatusUpdateEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, status, nextSteps: CANDIDATE_STATUS_GUIDANCE[status] }), emailType: 'application_status_update', dedupeKey: `application_status_update:${application.id}:${status}`, dedupeWindowMs: DUPLICATE_WINDOW_MS, applicationId: application.id, client, replyTo: supportingDocumentsEmail(application) }) : null;
  const adminContent = adminStatusChangeNotificationEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, previousStatus, status, actor: input.actor, adminRecordUrl: adminRecordUrl(application.id) });
  const internal = await Promise.all(recruitmentInternalRecipients(international).map((recipient) => sendTransactionalEmail({ to: recipient, content: adminContent, emailType: 'admin_status_change', dedupeKey: `admin_status_change:${application.id}:${status}:${recipient}`, dedupeWindowMs: DUPLICATE_WINDOW_MS, applicationId: application.id, client })));
  return { candidate, internal };
}

export async function sendInterviewInvitationEmails(input: { application: ApplicationEmailRecord; interview: InterviewEmailRecord; previousScheduledAt?: string | null; reason?: string | null; revision?: number }, client?: SupabaseClient | null): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;
  const candidate = await sendTransactionalEmail({ to: application.email, content: interviewInvitationEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, scheduledAt: interview.scheduled_at, durationMinutes: interview.duration_minutes, location: interview.location, meetingLink: interview.meeting_link, interviewer: interview.interviewer, instructions: interview.candidate_instructions }), emailType: 'interview_invitation', dedupeKey: `interview_invitation:${interview.id}`, applicationId: application.id, client, replyTo: recruitmentContacts.ireland });
  const internal = await sendInterviewAdminNotifications('scheduled', input, client);
  return { candidate, internal };
}

export async function sendInterviewRescheduledEmails(input: { application: ApplicationEmailRecord; interview: InterviewEmailRecord; previousScheduledAt?: string | null; reason?: string | null; revision?: number }, client?: SupabaseClient | null): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;
  const candidate = await sendTransactionalEmail({ to: application.email, content: interviewRescheduledEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, scheduledAt: interview.scheduled_at, previousScheduledAt: input.previousScheduledAt, durationMinutes: interview.duration_minutes, location: interview.location, meetingLink: interview.meeting_link, interviewer: interview.interviewer, instructions: interview.candidate_instructions }), emailType: 'interview_rescheduled', dedupeKey: `interview_rescheduled:${interview.id}:${input.revision ?? 0}`, applicationId: application.id, client, replyTo: recruitmentContacts.ireland });
  const internal = await sendInterviewAdminNotifications('rescheduled', input, client);
  return { candidate, internal };
}

export async function sendInterviewCancelledEmails(input: { application: ApplicationEmailRecord; interview: InterviewEmailRecord; previousScheduledAt?: string | null; reason?: string | null; revision?: number }, client?: SupabaseClient | null): Promise<{ candidate: SendResult; internal: SendResult[] }> {
  const { application, interview } = input;
  const candidate = await sendTransactionalEmail({ to: application.email, content: interviewCancelledEmail({ candidateName: application.full_name, role: application.role_applied, applicationId: application.id, scheduledAt: interview.scheduled_at, reason: input.reason }), emailType: 'interview_cancelled', dedupeKey: `interview_cancelled:${interview.id}`, applicationId: application.id, client, replyTo: recruitmentContacts.ireland });
  const internal = await sendInterviewAdminNotifications('cancelled', input, client);
  return { candidate, internal };
}

async function sendInterviewAdminNotifications(action: 'scheduled' | 'rescheduled' | 'cancelled', input: { application: ApplicationEmailRecord; interview: InterviewEmailRecord; revision?: number }, client?: SupabaseClient | null): Promise<SendResult[]> {
  const { application, interview } = input;
  const content = adminInterviewNotificationEmail({ action, candidateName: application.full_name, role: application.role_applied, applicationId: application.id, scheduledAt: interview.scheduled_at, location: interview.location, interviewer: interview.interviewer, adminRecordUrl: adminRecordUrl(application.id) });
  return Promise.all(recruitmentInternalRecipients(isInternationalRoutingCandidate(application)).map((recipient) => sendTransactionalEmail({ to: recipient, content, emailType: 'admin_interview_update', dedupeKey: `admin_interview_${action}:${interview.id}:${input.revision ?? 0}:${recipient}`, applicationId: application.id, client })));
}

export async function sendSecondInterviewInviteEmail(input: { application: ApplicationEmailRecord; interviewUrl: string; expiresLabel?: string | null; interviewId: string }, client?: SupabaseClient | null): Promise<SendResult> {
  return sendTransactionalEmail({ to: input.application.email, content: secondInterviewInviteEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, interviewUrl: input.interviewUrl, expiresLabel: input.expiresLabel }), emailType: 'second_interview_invite', dedupeKey: `second_interview_invite:${input.interviewId}`, applicationId: input.application.id, client, replyTo: recruitmentContacts.ireland });
}

export async function sendSecondInterviewCompletedEmails(input: { application: ApplicationEmailRecord; interviewId: string }, client?: SupabaseClient | null): Promise<SendResult[]> {
  const content = adminSecondInterviewCompletedEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, adminRecordUrl: adminRecordUrl(input.application.id) });
  return Promise.all([recruitmentContacts.admin].map((recipient) => sendTransactionalEmail({ to: recipient, content, emailType: 'admin_second_interview_completed', dedupeKey: `admin_second_interview_completed:${input.interviewId}:${recipient}`, applicationId: input.application.id, client })));
}

export async function sendOnboardingPackEmail(input: { application: ApplicationEmailRecord; contractSignUrl: string; jobDescriptionUrl: string; handbookUrl: string; packId: string }, client?: SupabaseClient | null): Promise<SendResult> {
  return sendTransactionalEmail({ to: input.application.email, content: onboardingPackEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, contractSignUrl: input.contractSignUrl, jobDescriptionUrl: input.jobDescriptionUrl, handbookUrl: input.handbookUrl }), emailType: 'onboarding_pack', dedupeKey: `onboarding_pack:${input.packId}`, applicationId: input.application.id, client, replyTo: recruitmentContacts.ireland });
}

export async function sendContractReadyToSignEmail(input: { application: ApplicationEmailRecord; signUrl: string; signatureId: string }, client?: SupabaseClient | null): Promise<SendResult> {
  return sendTransactionalEmail({ to: input.application.email, content: contractReadyToSignEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, signUrl: input.signUrl }), emailType: 'contract_ready_to_sign', dedupeKey: `contract_ready_to_sign:${input.signatureId}`, applicationId: input.application.id, client, replyTo: recruitmentContacts.ireland });
}

export async function sendAdminContractSignedEmail(input: { application: ApplicationEmailRecord; signedName: string; signedAtLabel: string; signatureId: string }, client?: SupabaseClient | null): Promise<SendResult[]> {
  return Promise.all(recruitmentInternalRecipients(isInternationalRoutingCandidate(input.application)).map((recipient) => sendTransactionalEmail({ to: recipient, content: adminContractSignedEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, signedName: input.signedName, signedAtLabel: input.signedAtLabel, adminRecordUrl: adminRecordUrl(input.application.id) }), emailType: 'admin_contract_signed', dedupeKey: `admin_contract_signed:${input.signatureId}:${recipient}`, applicationId: input.application.id, client })));
}

export async function sendAdminDocumentSignedEmail(input: { application: ApplicationEmailRecord; documentLabel: string; signedName: string; signedAtLabel: string; signatureId: string }, client?: SupabaseClient | null): Promise<SendResult[]> {
  return Promise.all(recruitmentInternalRecipients(isInternationalRoutingCandidate(input.application)).map((recipient) => sendTransactionalEmail({ to: recipient, content: adminDocumentSignedEmail({ candidateName: input.application.full_name, role: input.application.role_applied, applicationId: input.application.id, documentLabel: input.documentLabel, signedName: input.signedName, signedAtLabel: input.signedAtLabel, adminRecordUrl: adminRecordUrl(input.application.id) }), emailType: 'admin_document_signed', dedupeKey: `admin_document_signed:${input.signatureId}:${recipient}`, applicationId: input.application.id, client })));
}

export async function sendAdminPasswordResetEmail(input: { displayName: string; recipient: string; resetUrl: string; expiryMinutes: number }, client?: SupabaseClient | null): Promise<SendResult> {
  return sendTransactionalEmail({ to: input.recipient, content: adminPasswordResetEmail({ displayName: input.displayName, resetUrl: input.resetUrl, expiryMinutes: input.expiryMinutes }), emailType: 'admin_password_reset', client, replyTo: recruitmentContacts.admin });
}
