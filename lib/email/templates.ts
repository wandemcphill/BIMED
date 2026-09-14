/**
 * Bimed-branded transactional email templates.
 *
 * Every template is a pure function returning { subject, html, text } so it can be
 * unit tested without a Resend client. All interpolated values are HTML-escaped and
 * all subjects are header-safe (see sanitizeSubject).
 *
 * Brand tokens mirror app/globals.css (--navy, --blue, --blue-soft, --line, --muted).
 */

import { recruitmentContacts } from '../recruitment-config';

const BRAND = {
  navy: '#163247',
  blue: '#0a8ec6',
  blueSoft: '#e8f4f8',
  line: '#d7e1e6',
  text: '#243039',
  muted: '#66717a',
  page: '#f3f7f9',
} as const;

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

type DetailRow = {
  label: string;
  value: string | null | undefined;
};

type LayoutInput = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  rows?: DetailRow[];
  callout?: string;
  bullets?: string[];
  cta?: { label: string; url: string };
  /** Multiple named links (e.g. contract, job description, handbook), rendered as a list of buttons. */
  ctas?: { label: string; url: string }[];
  closing?: string;
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!
  );
}

/**
 * Strips CR/LF and control characters so a user-supplied value can never break out
 * of the subject line into an adjacent header field.
 */
export function sanitizeSubject(value: string): string {
  return value
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Only http(s) links are allowed in an email body. Anything else (javascript:,
 * data:, mailto: injected via a form field) is dropped rather than rendered.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function renderRows(rows: DetailRow[]) {
  const present = rows.filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '');
  if (present.length === 0) return '';
  const cells = present.map((row) => `
              <tr>
                <th align="left" style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px;font-weight:600;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(row.label)}</th>
                <td style="padding:8px 0;vertical-align:top;font-size:15px;color:${BRAND.text};">${escapeHtml(row.value)}</td>
              </tr>`).join('');
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};">
            <tbody>${cells}
            </tbody>
          </table>`;
}

function renderRowsText(rows: DetailRow[]) {
  return rows.filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '').map((row) => `${row.label}: ${row.value}`).join('\n');
}

function layout(input: LayoutInput): { html: string; text: string } {
  const rowsHtml = input.rows ? renderRows(input.rows) : '';
  const bulletsHtml = input.bullets?.length ? `
          <ul style="margin:16px 0;padding-left:20px;font-size:15px;line-height:1.6;color:${BRAND.text};">
            ${input.bullets.map((bullet) => `<li style="margin:6px 0;">${escapeHtml(bullet)}</li>`).join('\n            ')}
          </ul>` : '';
  const calloutHtml = input.callout ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="background:${BRAND.blueSoft};border-left:4px solid ${BRAND.blue};border-radius:4px;padding:14px 16px;font-size:15px;line-height:1.6;color:${BRAND.navy};">${escapeHtml(input.callout)}</td>
            </tr>
          </table>` : '';
  const ctaUrl = input.cta ? safeUrl(input.cta.url) : null;
  const ctaHtml = input.cta && ctaUrl ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
            <tr>
              <td style="border-radius:6px;background:${BRAND.blue};">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(input.cta.label)}</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${BRAND.muted};word-break:break-all;">If the button does not work, copy this link into your browser:<br/>${escapeHtml(ctaUrl)}</p>` : '';
  const validCtas = (input.ctas || []).map((entry) => ({ ...entry, url: safeUrl(entry.url) })).filter((entry) => entry.url);
  const ctasHtml = validCtas.length ? validCtas.map((entry) => `
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;">
            <tr>
              <td style="border-radius:6px;background:${BRAND.blue};">
                <a href="${escapeHtml(entry.url!)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(entry.label)}</a>
              </td>
            </tr>
          </table>`).join('\n          ') : '';
  const paragraphsHtml = input.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(paragraph)}</p>`).join('\n          ');
  const closingHtml = input.closing ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(input.closing).replace(/\n/g, '<br/>')}</p>` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${BRAND.page};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:10px;">
        <tr><td style="padding:22px 28px;background:${BRAND.navy};border-radius:10px 10px 0 0;">
          <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">Bimed Healthcare</div>
          <div style="font-size:12px;color:#a9c4d4;margin-top:4px;">Love. Care. Comfort.</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${BRAND.navy};font-weight:700;">${escapeHtml(input.heading)}</h1>
          ${paragraphsHtml}${calloutHtml}${rowsHtml}${bulletsHtml}${ctasHtml}${ctaHtml}${closingHtml}
        </td></tr>
        <tr><td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.line};font-size:12px;line-height:1.6;color:${BRAND.muted};">
          Bimed Healthcare Limited &middot; Dublin, Ireland<br/>
          Recruitment: <a href="mailto:${escapeHtml(recruitmentContacts.ireland)}" style="color:${BRAND.blue};">${escapeHtml(recruitmentContacts.ireland)}</a> &middot; Admin: <a href="mailto:${escapeHtml(recruitmentContacts.admin)}" style="color:${BRAND.blue};">${escapeHtml(recruitmentContacts.admin)}</a><br/>
          This is an automated message from the Bimed recruitment portal. Please do not reply to this address.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textParts = ['BIMED HEALTHCARE', '', input.heading, '', ...input.paragraphs];
  if (input.callout) textParts.push('', input.callout);
  if (input.rows) {
    const rowsText = renderRowsText(input.rows);
    if (rowsText) textParts.push('', rowsText);
  }
  if (input.bullets?.length) textParts.push('', input.bullets.map((bullet) => `• ${bullet}`).join('\n'));
  if (input.ctas?.length) textParts.push('', ...input.ctas.map((entry) => `${entry.label}: ${entry.url}`));
  if (input.cta && ctaUrl) textParts.push('', `${input.cta.label}: ${ctaUrl}`);
  if (input.closing) textParts.push('', input.closing);
  textParts.push('', 'Bimed Healthcare Limited · Dublin, Ireland', `Recruitment: ${recruitmentContacts.ireland}`, `Admin: ${recruitmentContacts.admin}`);
  return { html, text: textParts.join('\n') };
}

export function recruitmentInviteEmail(input: { candidateName?: string | null; role?: string | null; applyUrl: string; expiresLabel?: string | null }): EmailContent {
  const name = input.candidateName?.trim() || 'Candidate';
  return { subject: sanitizeSubject(`BIMED Healthcare recruitment invitation${input.role ? ` · ${input.role}` : ''}`), ...layout({ preheader: 'Your private BIMED Healthcare application invitation.', heading: `Your BIMED Healthcare invitation${input.role ? ` for ${input.role}` : ''}`, paragraphs: [`Dear ${name},`, 'You have been invited to apply for a position with BIMED Healthcare. This invitation is private and is intended only for you.'], rows: input.role ? [{ label: 'Position', value: input.role }] : undefined, callout: input.expiresLabel ? `Please complete your application before ${input.expiresLabel}.` : undefined, cta: { label: 'Open your application', url: input.applyUrl }, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function applicationReceivedEmail(input: { candidateName: string; role?: string | null; applicationId: string; supportingDocumentsEmail: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare application received · ${input.candidateName}`), ...layout({ preheader: 'We have received your BIMED Healthcare application.', heading: 'Application received', paragraphs: [`Dear ${input.candidateName},`, 'Thank you for submitting your application to BIMED Healthcare. Your application has been received and is now with our recruitment team for review.', 'Please do not send documents through this portal unless we specifically instruct you to do so.'], rows: [{ label: 'Application reference', value: input.applicationId }, { label: 'Position', value: input.role }], callout: `Please send any supporting documents to ${input.supportingDocumentsEmail}, using your full name in the subject line.`, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function applicationStatusUpdateEmail(input: { candidateName: string; role?: string | null; applicationId: string; status: string; nextSteps: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare application update · ${input.candidateName}`), ...layout({ preheader: `Your BIMED Healthcare application status is now ${input.status}.`, heading: 'Application update', paragraphs: [`Dear ${input.candidateName},`, `There has been an update to your BIMED Healthcare application.`, input.nextSteps], rows: [{ label: 'Application reference', value: input.applicationId }, { label: 'Position', value: input.role }, { label: 'Status', value: input.status }], closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function interviewInvitationEmail(input: { candidateName: string; role?: string | null; applicationId: string; scheduledAt: string; durationMinutes?: number | null; location?: string | null; meetingLink?: string | null; interviewer?: string | null; instructions?: string | null }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare interview invitation · ${input.candidateName}`), ...layout({ preheader: 'Your BIMED Healthcare interview has been scheduled.', heading: 'Interview invitation', paragraphs: [`Dear ${input.candidateName},`, 'Your BIMED Healthcare interview has been scheduled.'], rows: [{ label: 'Position', value: input.role }, { label: 'Date and time', value: input.scheduledAt }, { label: 'Duration', value: input.durationMinutes ? `${input.durationMinutes} minutes` : null }, { label: 'Location', value: input.location }, { label: 'Interviewer', value: input.interviewer }], callout: input.instructions || undefined, cta: input.meetingLink ? { label: 'Open interview link', url: input.meetingLink } : undefined, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function interviewRescheduledEmail(input: { candidateName: string; role?: string | null; applicationId: string; scheduledAt: string; previousScheduledAt?: string | null; durationMinutes?: number | null; location?: string | null; meetingLink?: string | null; interviewer?: string | null; instructions?: string | null }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare interview rescheduled · ${input.candidateName}`), ...layout({ preheader: 'Your BIMED Healthcare interview has been rescheduled.', heading: 'Interview rescheduled', paragraphs: [`Dear ${input.candidateName},`, 'Your BIMED Healthcare interview has been rescheduled.'], rows: [{ label: 'New date and time', value: input.scheduledAt }, { label: 'Previous date and time', value: input.previousScheduledAt }, { label: 'Position', value: input.role }, { label: 'Duration', value: input.durationMinutes ? `${input.durationMinutes} minutes` : null }, { label: 'Location', value: input.location }, { label: 'Interviewer', value: input.interviewer }], callout: input.instructions || undefined, cta: input.meetingLink ? { label: 'Open interview link', url: input.meetingLink } : undefined, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function interviewCancelledEmail(input: { candidateName: string; role?: string | null; applicationId: string; scheduledAt: string; reason?: string | null }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare interview cancelled · ${input.candidateName}`), ...layout({ preheader: 'A change has been made to your BIMED Healthcare interview.', heading: 'Interview cancelled', paragraphs: [`Dear ${input.candidateName},`, 'Your BIMED Healthcare interview has been cancelled. We will contact you again if a new interview is required.'], rows: [{ label: 'Position', value: input.role }, { label: 'Scheduled date and time', value: input.scheduledAt }], callout: input.reason || undefined, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function secondInterviewInviteEmail(input: { candidateName: string; role?: string | null; applicationId: string; interviewUrl: string; expiresLabel?: string | null }): EmailContent {
  const name = input.candidateName.trim();
  return { subject: sanitizeSubject(`BIMED Healthcare practical interview · ${name}`), ...layout({ preheader: 'Your BIMED Healthcare practical interview is ready.', heading: 'Practical interview invitation', paragraphs: [`Dear ${name},`, 'We have invited you to complete the next stage of the BIMED Healthcare recruitment process.'], rows: [{ label: 'Position', value: input.role }, { label: 'Application reference', value: input.applicationId }], callout: input.expiresLabel ? `Please complete the practical interview before ${input.expiresLabel}.` : undefined, cta: { label: 'Open practical interview', url: input.interviewUrl }, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function onboardingPackEmail(input: { candidateName: string; role?: string | null; applicationId: string; contractSignUrl: string; jobDescriptionUrl: string; handbookUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare onboarding pack · ${input.candidateName}`), ...layout({ preheader: 'Your BIMED Healthcare onboarding documents are ready.', heading: 'Your onboarding pack is ready', paragraphs: [`Dear ${input.candidateName},`, 'Your BIMED Healthcare onboarding pack is now ready. Please review the documents carefully and complete each required step.'], rows: [{ label: 'Position', value: input.role }, { label: 'Application reference', value: input.applicationId }], ctas: [{ label: 'Sign employment contract', url: input.contractSignUrl }, { label: 'Read job description', url: input.jobDescriptionUrl }, { label: 'Read employee handbook', url: input.handbookUrl }], closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function contractReadyToSignEmail(input: { candidateName: string; role?: string | null; applicationId: string; signUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare employment contract ready · ${input.candidateName}`), ...layout({ preheader: 'Your BIMED Healthcare employment contract is ready to sign.', heading: 'Employment contract ready', paragraphs: [`Dear ${input.candidateName},`, 'Your employment contract is ready for electronic signature.'], rows: [{ label: 'Position', value: input.role }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Review and sign contract', url: input.signUrl }, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function documentReadyToSignEmail(input: { candidateName: string; documentLabel: string; role?: string | null; applicationId: string; signUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED Healthcare document ready to sign · ${input.candidateName}`), ...layout({ preheader: `Your ${input.documentLabel} is ready for signature.`, heading: `${input.documentLabel} ready to sign`, paragraphs: [`Dear ${input.candidateName},`, `Your ${input.documentLabel} is ready for electronic signature.`], rows: [{ label: 'Position', value: input.role }, { label: 'Application reference', value: input.applicationId }], cta: { label: `Sign ${input.documentLabel}`, url: input.signUrl }, closing: 'Kind regards,\nBIMED Healthcare Recruitment' }) };
}

export function adminPasswordResetEmail(input: { displayName: string; resetUrl: string; expiryMinutes: number }): EmailContent {
  return { subject: sanitizeSubject('BIMED Healthcare admin password reset'), ...layout({ preheader: 'Your BIMED Healthcare admin password reset link.', heading: 'Reset your admin password', paragraphs: [`Dear ${input.displayName},`, `Use the secure link below to reset your BIMED Healthcare admin password. The link expires in ${input.expiryMinutes} minutes and can only be used once.`], cta: { label: 'Reset admin password', url: input.resetUrl }, closing: 'Kind regards,\nBIMED Healthcare' }) };
}

export function adminNewApplicationEmail(input: { candidateName: string; candidateEmail: string; phone?: string | null; role?: string | null; countryOfResidence?: string | null; pathway: string; workPermission?: string | null; submittedLabel: string; adminRecordUrl: string; applicationId: string }): EmailContent {
  return { subject: sanitizeSubject(`New BIMED Healthcare application · ${input.candidateName}`), ...layout({ preheader: 'A new BIMED Healthcare recruitment application has been submitted.', heading: 'New recruitment application', paragraphs: ['A candidate has submitted a new application through the private BIMED recruitment portal.'], rows: [{ label: 'Candidate', value: input.candidateName }, { label: 'Email', value: input.candidateEmail }, { label: 'Phone', value: input.phone }, { label: 'Position', value: input.role }, { label: 'Pathway', value: input.pathway }, { label: 'Country', value: input.countryOfResidence }, { label: 'Work permission', value: input.workPermission }, { label: 'Submitted', value: input.submittedLabel }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Open application', url: input.adminRecordUrl }, closing: 'BIMED Healthcare Recruitment' }) };
}

export function adminInterviewNotificationEmail(input: { action: string; candidateName: string; role?: string | null; applicationId: string; scheduledAt: string; location?: string | null; interviewer?: string | null; adminRecordUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`BIMED interview ${input.action} · ${input.candidateName}`), ...layout({ preheader: `BIMED interview ${input.action}.`, heading: `Interview ${input.action}`, paragraphs: [`The interview for ${input.candidateName} has been ${input.action}.`], rows: [{ label: 'Candidate', value: input.candidateName }, { label: 'Position', value: input.role }, { label: 'Date and time', value: input.scheduledAt }, { label: 'Location', value: input.location }, { label: 'Interviewer', value: input.interviewer }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Open application', url: input.adminRecordUrl }, closing: 'BIMED Healthcare Recruitment' }) };
}

export function adminSecondInterviewCompletedEmail(input: { candidateName: string; role?: string | null; applicationId: string; adminRecordUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`Practical interview completed · ${input.candidateName}`), ...layout({ preheader: 'A BIMED practical interview has been completed.', heading: 'Practical interview completed', paragraphs: [`The practical interview for ${input.candidateName} has been completed.`], rows: [{ label: 'Position', value: input.role }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Open application', url: input.adminRecordUrl }, closing: 'BIMED Healthcare Recruitment' }) };
}

export function adminContractSignedEmail(input: { candidateName: string; role?: string | null; applicationId: string; signedName: string; signedAtLabel: string; adminRecordUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`Employment contract signed · ${input.candidateName}`), ...layout({ preheader: 'A BIMED employment contract has been signed.', heading: 'Employment contract signed', paragraphs: [`${input.candidateName} has signed the BIMED employment contract.`], rows: [{ label: 'Signed name', value: input.signedName }, { label: 'Position', value: input.role }, { label: 'Signed', value: input.signedAtLabel }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Open application', url: input.adminRecordUrl }, closing: 'BIMED Healthcare Recruitment' }) };
}

export function adminDocumentSignedEmail(input: { candidateName: string; documentLabel: string; role?: string | null; applicationId: string; signedName: string; signedAtLabel: string; adminRecordUrl: string }): EmailContent {
  return { subject: sanitizeSubject(`${input.documentLabel} signed · ${input.candidateName}`), ...layout({ preheader: `The ${input.documentLabel} has been signed.`, heading: `${input.documentLabel} signed`, paragraphs: [`${input.candidateName} has signed the ${input.documentLabel}.`], rows: [{ label: 'Signed name', value: input.signedName }, { label: 'Position', value: input.role }, { label: 'Signed', value: input.signedAtLabel }, { label: 'Application reference', value: input.applicationId }], cta: { label: 'Open application', url: input.adminRecordUrl }, closing: 'BIMED Healthcare Recruitment' }) };
}

export function staffWelcomeEmail(input: { candidateName: string; role?: string | null; bimedId: string; startDate?: string | null; status: string; activationUrl: string; portalUrl: string; internalAddress?: string | null }): EmailContent {
  const greetingName = input.candidateName.trim() || 'New BIMED colleague';
  return {
    subject: sanitizeSubject(`Welcome to BIMED Healthcare · ${greetingName}`),
    ...layout({
      preheader: 'Your BIMED Staff Portal account is ready.',
      heading: 'Welcome to BIMED Healthcare',
      paragraphs: [`Dear ${greetingName},`, `Welcome to BIMED Healthcare. Your permanent staff identity has now been created for your role as ${input.role || 'BIMED Staff'}.`, 'Your Staff Portal is your secure workplace account. It brings together your rota, attendance, payslips, profile, notifications, messages and, where applicable, your recruitment-linked onboarding workspace.'],
      rows: [
        { label: 'Position', value: input.role },
        { label: 'BIMED ID', value: input.bimedId },
        { label: 'Start date', value: input.startDate },
        { label: 'Internal address', value: input.internalAddress },
        { label: 'Status', value: input.status === 'pre_arrival' ? 'Pre-arrival' : 'Active' },
      ],
      bullets: [
        'Open your activation link and create your password. The link is time-limited for your security.',
        'Complete your profile and upload a clear profile photograph.',
        'Use Messages to contact BIMED Admin / HR and read their replies.',
        'Use My Rota for assigned shifts and available-work requests.',
        'Use Payslips and Attendance as those records become available to you.',
        'Keep your contact and payroll information up to date in My Profile.',
      ],
      ctas: [
        { label: 'Activate your Staff Portal account', url: input.activationUrl },
        { label: 'Open the BIMED Staff Portal', url: input.portalUrl },
      ],
      closing: 'We are pleased to welcome you to the BIMED team.\nBIMED Healthcare' })
  };
}
