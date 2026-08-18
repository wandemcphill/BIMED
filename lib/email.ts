import { Resend } from 'resend';
import {
  recruitmentContacts,
  recruitmentCopy,
  supportingDocumentsEmail,
  isInternationalCandidate,
} from '@/lib/recruitment-config';

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]!;
  });
}

export async function sendRecruitmentEmails(application: {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role_applied?: string | null;
  country_of_residence?: string | null;
  living_in_ireland?: string | null;
  work_permission?: string | null;
  submitted_at?: string | null;
}) {
  if (!process.env.RESEND_API_KEY) {
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const international = isInternationalCandidate(application);
  const supportEmail = supportingDocumentsEmail(application);
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL || recruitmentContacts.ireland;
  const submittedAt = application.submitted_at ? new Date(application.submitted_at) : new Date();
  const submittedLabel = submittedAt.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const adminRecordUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin?application=${application.id}`;

  await Promise.allSettled([
    resend.emails.send({
      from: process.env.EMAIL_FROM || 'Bimed Healthcare <info@bimedhealthcare.com>',
      to: application.email,
      subject: recruitmentCopy.candidateConfirmation.subject,
      html: `
        <p>Dear ${escapeHtml(application.full_name)},</p>
        <p>Thank you for completing the next stage of your Bimed Healthcare application.</p>
        <p>Your application has been successfully received by our recruitment team.</p>
        <p>Please send your supporting documents separately to:</p>
        <p><strong>${escapeHtml(supportEmail)}</strong></p>
        <p>Please use your full name in the email subject so our recruitment team can match your documents to your application.</p>
        <p>Our recruitment team will review your application and contact you regarding the next stage of the recruitment process.</p>
        <p>Kind regards,<br/>Bimed Healthcare Recruitment Team</p>
      `,
    }),
    resend.emails.send({
      from: process.env.EMAIL_FROM || 'Bimed Healthcare <info@bimedhealthcare.com>',
      to: adminTo,
      subject: `${recruitmentCopy.adminNotification.subjectPrefix} ${application.full_name}`,
      html: `
        <p>New application received in the recruitment portal.</p>
        <ul>
          <li><strong>Candidate:</strong> ${escapeHtml(application.full_name)}</li>
          <li><strong>Email:</strong> ${escapeHtml(application.email)}</li>
          <li><strong>Phone:</strong> ${escapeHtml(application.phone || '')}</li>
          <li><strong>Position:</strong> ${escapeHtml(application.role_applied || '')}</li>
          <li><strong>Country of residence:</strong> ${escapeHtml(application.country_of_residence || '')}</li>
          <li><strong>Pathway:</strong> ${international ? 'International' : 'Ireland-based'}</li>
          <li><strong>Work permission:</strong> ${escapeHtml(application.work_permission || '')}</li>
          <li><strong>Submitted:</strong> ${escapeHtml(submittedLabel)}</li>
        </ul>
        <p><strong>Admin record:</strong> <a href="${adminRecordUrl}">${adminRecordUrl}</a></p>
      `,
    }),
  ]);
}
