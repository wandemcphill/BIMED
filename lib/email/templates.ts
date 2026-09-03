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
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function renderRows(rows: DetailRow[]) {
  const present = rows.filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '');

  if (present.length === 0) {
    return '';
  }

  const cells = present
    .map(
      (row) => `
              <tr>
                <th align="left" style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px;font-weight:600;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(
                  row.label
                )}</th>
                <td style="padding:8px 0;vertical-align:top;font-size:15px;color:${BRAND.text};">${escapeHtml(row.value)}</td>
              </tr>`
    )
    .join('');

  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};">
            <tbody>${cells}
            </tbody>
          </table>`;
}

function renderRowsText(rows: DetailRow[]) {
  return rows
    .filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== '')
    .map((row) => `${row.label}: ${row.value}`)
    .join('\n');
}

/**
 * Table-based layout with inline styles: the combination that renders reliably in
 * Outlook, Gmail and Apple Mail. Kept deliberately plain.
 */
function layout(input: LayoutInput): { html: string; text: string } {
  const rowsHtml = input.rows ? renderRows(input.rows) : '';
  const bulletsHtml = input.bullets?.length
    ? `
          <ul style="margin:16px 0;padding-left:20px;font-size:15px;line-height:1.6;color:${BRAND.text};">
            ${input.bullets.map((bullet) => `<li style="margin:6px 0;">${escapeHtml(bullet)}</li>`).join('\n            ')}
          </ul>`
    : '';
  const calloutHtml = input.callout
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="background:${BRAND.blueSoft};border-left:4px solid ${BRAND.blue};border-radius:4px;padding:14px 16px;font-size:15px;line-height:1.6;color:${BRAND.navy};">${escapeHtml(
                input.callout
              )}</td>
            </tr>
          </table>`
    : '';

  const ctaUrl = input.cta ? safeUrl(input.cta.url) : null;
  const ctaHtml =
    input.cta && ctaUrl
      ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
            <tr>
              <td style="border-radius:6px;background:${BRAND.blue};">
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(
                  input.cta.label
                )}</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${BRAND.muted};word-break:break-all;">If the button does not work, copy this link into your browser:<br/>${escapeHtml(
            ctaUrl
          )}</p>`
      : '';

  const paragraphsHtml = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(paragraph)}</p>`)
    .join('\n          ');

  // Escape first, then turn the newlines into <br/> so a sign-off keeps its line breaks.
  const closingHtml = input.closing
    ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(input.closing).replace(
        /\n/g,
        '<br/>'
      )}</p>`
    : '';

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
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:10px;">
          <tr>
            <td style="padding:22px 28px;background:${BRAND.navy};border-radius:10px 10px 0 0;">
              <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">Bimed Healthcare</div>
              <div style="font-size:12px;color:#a9c4d4;margin-top:4px;">Love. Care. Comfort.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${BRAND.navy};font-weight:700;">${escapeHtml(
                input.heading
              )}</h1>
          ${paragraphsHtml}${calloutHtml}${rowsHtml}${bulletsHtml}${ctaHtml}
          ${closingHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.line};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              Bimed Healthcare Limited &middot; Dublin, Ireland<br/>
              Recruitment: <a href="mailto:${escapeHtml(recruitmentContacts.ireland)}" style="color:${BRAND.blue};">${escapeHtml(
                recruitmentContacts.ireland
              )}</a> &middot; Admin: <a href="mailto:${escapeHtml(recruitmentContacts.admin)}" style="color:${BRAND.blue};">${escapeHtml(
                recruitmentContacts.admin
              )}</a><br/>
              This is an automated message from the Bimed recruitment portal. Please do not reply to this address.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    'BIMED HEALTHCARE',
    '',
    input.heading,
    '',
    ...input.paragraphs,
  ];

  if (input.callout) {
    textParts.push('', input.callout);
  }
  if (input.rows) {
    const rowsText = renderRowsText(input.rows);
    if (rowsText) {
      textParts.push('', rowsText);
    }
  }
  if (input.bullets?.length) {
    textParts.push('', ...input.bullets.map((bullet) => `- ${bullet}`));
  }
  if (ctaUrl) {
    textParts.push('', `${input.cta!.label}: ${ctaUrl}`);
  }
  if (input.closing) {
    textParts.push('', input.closing);
  }

  textParts.push(
    '',
    '---',
    'Bimed Healthcare Limited, Dublin, Ireland',
    `Recruitment: ${recruitmentContacts.ireland} | Admin: ${recruitmentContacts.admin}`,
    'This is an automated message from the Bimed recruitment portal. Please do not reply to this address.'
  );

  return { html, text: textParts.join('\n') };
}

function build(subject: string, input: LayoutInput): EmailContent {
  const { html, text } = layout(input);
  return { subject: sanitizeSubject(subject), html, text };
}

export function formatInterviewDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'To be confirmed';
  }

  return new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Dublin',
  }).format(date);
}

/** Short, human-usable reference derived from the application UUID. */
export function applicationReference(id: string): string {
  return `BIMED-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Candidate templates
// ---------------------------------------------------------------------------

export function applicationReceivedEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  supportingDocumentsEmail: string;
}): EmailContent {
  return build('Bimed Healthcare recruitment application received', {
    preheader: 'We have received your application and confirmed your next step.',
    heading: 'Your application has been received',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'Thank you for completing the next stage of your Bimed Healthcare application. Your application has been received by our recruitment team.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
    ],
    callout: `Next step: email your supporting documents to ${input.supportingDocumentsEmail}, using your full name in the subject line so we can match them to your application.`,
    bullets: [
      'Our recruitment team will review your application.',
      'We will contact you about the next stage of the process.',
      'Keep your reference number for any correspondence with us.',
    ],
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

export function applicationStatusUpdateEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  status: string;
  nextSteps: string;
}): EmailContent {
  return build('Update on your Bimed Healthcare application', {
    preheader: `Your application status is now ${input.status}.`,
    heading: 'Update on your application',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'There is an update on your Bimed Healthcare recruitment application.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Status', value: input.status },
    ],
    callout: input.nextSteps,
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

export function interviewInvitationEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  scheduledAt: string | Date;
  durationMinutes?: number | null;
  location?: string | null;
  meetingLink?: string | null;
  interviewer?: string | null;
  instructions?: string | null;
}): EmailContent {
  const link = safeUrl(input.meetingLink);

  return build('Interview invitation - Bimed Healthcare', {
    preheader: `Interview scheduled for ${formatInterviewDateTime(input.scheduledAt)}.`,
    heading: 'You are invited to an interview',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'We would like to invite you to an interview for your application to Bimed Healthcare. The details are below.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Date and time', value: formatInterviewDateTime(input.scheduledAt) },
      { label: 'Duration', value: input.durationMinutes ? `${input.durationMinutes} minutes` : null },
      { label: 'Location', value: input.location },
      { label: 'Interviewer', value: input.interviewer },
      { label: 'Time zone', value: 'Irish time (Europe/Dublin)' },
    ],
    callout: input.instructions || undefined,
    cta: link ? { label: 'Join the interview', url: link } : undefined,
    bullets: [
      'Please reply to our recruitment team to confirm you can attend.',
      'Have your identification and any qualification documents available.',
      'Tell us as early as possible if you need to rearrange.',
    ],
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

export function interviewRescheduledEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  scheduledAt: string | Date;
  previousScheduledAt?: string | Date | null;
  durationMinutes?: number | null;
  location?: string | null;
  meetingLink?: string | null;
  interviewer?: string | null;
  instructions?: string | null;
}): EmailContent {
  const link = safeUrl(input.meetingLink);

  return build('Your Bimed Healthcare interview has been rescheduled', {
    preheader: `New interview time: ${formatInterviewDateTime(input.scheduledAt)}.`,
    heading: 'Your interview has been rescheduled',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'Your Bimed Healthcare interview has been moved. Please use the new details below and disregard the previous invitation.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Previous time', value: input.previousScheduledAt ? formatInterviewDateTime(input.previousScheduledAt) : null },
      { label: 'New date and time', value: formatInterviewDateTime(input.scheduledAt) },
      { label: 'Duration', value: input.durationMinutes ? `${input.durationMinutes} minutes` : null },
      { label: 'Location', value: input.location },
      { label: 'Interviewer', value: input.interviewer },
      { label: 'Time zone', value: 'Irish time (Europe/Dublin)' },
    ],
    callout: input.instructions || undefined,
    cta: link ? { label: 'Join the interview', url: link } : undefined,
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

export function interviewCancelledEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  scheduledAt: string | Date;
  reason?: string | null;
}): EmailContent {
  return build('Your Bimed Healthcare interview has been cancelled', {
    preheader: 'Your scheduled interview has been cancelled.',
    heading: 'Your interview has been cancelled',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'The interview below has been cancelled. Your application remains with our recruitment team.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Cancelled interview', value: formatInterviewDateTime(input.scheduledAt) },
      { label: 'Reason', value: input.reason },
    ],
    callout: `Our recruitment team will contact you about next steps. If you have questions, email ${recruitmentContacts.ireland}.`,
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

export function contractReadyToSignEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  signUrl: string;
}): EmailContent {
  const link = safeUrl(input.signUrl);

  return build('Your Bimed Healthcare employment contract is ready to sign', {
    preheader: 'Your employment contract is ready for you to review and sign online.',
    heading: 'Your employment contract is ready to sign',
    paragraphs: [
      `Dear ${input.candidateName},`,
      'Your Bimed Healthcare employment contract has been prepared and is ready for you to review and sign online.',
    ],
    rows: [
      { label: 'Position', value: input.role || 'To be confirmed' },
      { label: 'Reference', value: applicationReference(input.applicationId) },
    ],
    callout: 'Please read the full contract carefully before signing. This link is for your use only and should not be shared.',
    cta: link ? { label: 'Review and sign your contract', url: link } : undefined,
    bullets: [
      'The link above opens your contract with your details already filled in.',
      'Signing online confirms you accept the terms set out in the contract.',
      'Contact our recruitment team first if you have any questions before signing.',
    ],
    closing: 'Kind regards,\nBimed Healthcare Recruitment Team',
  });
}

// ---------------------------------------------------------------------------
// Admin templates
// ---------------------------------------------------------------------------

export function adminContractSignedEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  signedName: string;
  signedAtLabel: string;
  adminRecordUrl: string;
}): EmailContent {
  return build(`Contract signed: ${input.candidateName}`, {
    preheader: `${input.candidateName} signed their employment contract.`,
    heading: 'Employment contract signed',
    paragraphs: ['A candidate has signed their employment contract online.'],
    rows: [
      { label: 'Candidate', value: input.candidateName },
      { label: 'Position', value: input.role },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Signed as', value: input.signedName },
      { label: 'Signed at', value: input.signedAtLabel },
    ],
    cta: { label: 'Open candidate record', url: input.adminRecordUrl },
    closing: 'Bimed recruitment portal',
  });
}

export function adminNewApplicationEmail(input: {
  candidateName: string;
  candidateEmail: string;
  phone?: string | null;
  role?: string | null;
  countryOfResidence?: string | null;
  pathway: 'International' | 'Ireland-based';
  workPermission?: string | null;
  submittedLabel: string;
  adminRecordUrl: string;
  applicationId: string;
}): EmailContent {
  return build(`New Bimed Healthcare application: ${input.candidateName}`, {
    preheader: `${input.candidateName} submitted an application via the recruitment portal.`,
    heading: 'New application received',
    paragraphs: ['A candidate has submitted an application through the recruitment portal.'],
    rows: [
      { label: 'Candidate', value: input.candidateName },
      { label: 'Email', value: input.candidateEmail },
      { label: 'Phone', value: input.phone },
      { label: 'Position', value: input.role },
      { label: 'Country of residence', value: input.countryOfResidence },
      { label: 'Pathway', value: input.pathway },
      { label: 'Work permission', value: input.workPermission },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Submitted', value: input.submittedLabel },
    ],
    cta: { label: 'Open candidate record', url: input.adminRecordUrl },
    closing: 'Bimed recruitment portal',
  });
}

export function adminInterviewNotificationEmail(input: {
  action: 'scheduled' | 'rescheduled' | 'cancelled';
  candidateName: string;
  role?: string | null;
  applicationId: string;
  scheduledAt: string | Date;
  location?: string | null;
  interviewer?: string | null;
  adminRecordUrl: string;
}): EmailContent {
  const actionLabel = {
    scheduled: 'Interview scheduled',
    rescheduled: 'Interview rescheduled',
    cancelled: 'Interview cancelled',
  }[input.action];

  return build(`${actionLabel}: ${input.candidateName}`, {
    preheader: `${actionLabel} for ${input.candidateName}.`,
    heading: actionLabel,
    paragraphs: [`An interview record was updated in the recruitment portal.`],
    rows: [
      { label: 'Candidate', value: input.candidateName },
      { label: 'Position', value: input.role },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: input.action === 'cancelled' ? 'Cancelled interview' : 'Date and time', value: formatInterviewDateTime(input.scheduledAt) },
      { label: 'Location', value: input.location },
      { label: 'Interviewer', value: input.interviewer },
    ],
    cta: { label: 'Open candidate record', url: input.adminRecordUrl },
    closing: 'Bimed recruitment portal',
  });
}

export function adminStatusChangeNotificationEmail(input: {
  candidateName: string;
  role?: string | null;
  applicationId: string;
  previousStatus: string;
  status: string;
  actor: string;
  adminRecordUrl: string;
}): EmailContent {
  return build(`Application status changed: ${input.candidateName}`, {
    preheader: `${input.candidateName} moved to ${input.status}.`,
    heading: 'Application status changed',
    paragraphs: ['A candidate application status was updated and requires attention.'],
    rows: [
      { label: 'Candidate', value: input.candidateName },
      { label: 'Position', value: input.role },
      { label: 'Reference', value: applicationReference(input.applicationId) },
      { label: 'Previous status', value: input.previousStatus },
      { label: 'New status', value: input.status },
      { label: 'Changed by', value: input.actor },
    ],
    cta: { label: 'Open candidate record', url: input.adminRecordUrl },
    closing: 'Bimed recruitment portal',
  });
}

// ---------------------------------------------------------------------------
// Admin account templates
// ---------------------------------------------------------------------------

export function adminPasswordResetEmail(input: { displayName: string; resetUrl: string; expiryMinutes: number }): EmailContent {
  return build('Reset your Bimed recruitment portal password', {
    preheader: 'A password reset was requested for your Bimed admin account.',
    heading: 'Reset your password',
    paragraphs: [
      `Hello ${input.displayName},`,
      'We received a request to reset the password for your Bimed recruitment portal admin account. Use the button below to choose a new password.',
    ],
    callout: `This link can only be used once and expires in ${input.expiryMinutes} minutes.`,
    cta: { label: 'Choose a new password', url: input.resetUrl },
    bullets: [
      'If you did not request this, you can ignore this email and your password will stay the same.',
      'Never share this link with anyone.',
    ],
    closing: 'Bimed recruitment portal',
  });
}
