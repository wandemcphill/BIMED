import type { EmailContent } from './templates';
import { escapeHtml, safeUrl, sanitizeSubject } from './templates';
import { recruitmentContacts } from '../recruitment-config';

type ApplicationLike = {
  id: string;
  full_name: string;
  email: string;
  role_applied?: string | null;
};

function buildEmail(input: {
  subject: string;
  heading: string;
  preheader: string;
  paragraphs: string[];
  rows: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaUrl?: string;
  closing: string;
}): EmailContent {
  const ctaUrl = safeUrl(input.ctaUrl);
  const rowsHtml = input.rows.map((row) =>
    '<tr><th align="left" style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px;color:#66717a;">' +
    escapeHtml(row.label) +
    '</th><td style="padding:8px 0;font-size:15px;color:#243039;">' +
    escapeHtml(row.value) +
    '</td></tr>'
  ).join('');
  const ctaHtml = ctaUrl && input.ctaLabel
    ? '<p style="margin:24px 0;"><a href="' + escapeHtml(ctaUrl) + '" style="display:inline-block;padding:12px 22px;border-radius:6px;background:#0a8ec6;color:#fff;text-decoration:none;font-weight:700;">' +
      escapeHtml(input.ctaLabel) + '</a></p><p style="font-size:13px;color:#66717a;word-break:break-all;">If the button does not work, copy this link into your browser:<br/>' +
      escapeHtml(ctaUrl) + '</p>'
    : '';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"/></head><body style="margin:0;padding:24px;background:#f3f7f9;">' +
    '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #d7e1e6;border-radius:10px;overflow:hidden;">' +
    '<div style="padding:22px 28px;background:#163247;color:#fff;"><strong style="font-size:18px;">Bimed Healthcare</strong><div style="font-size:12px;color:#a9c4d4;margin-top:4px;">Love. Care. Comfort.</div></div>' +
    '<div style="padding:28px;"><div style="display:inline-block;padding:5px 9px;border-radius:999px;background:#e8f4f8;color:#0a6f95;font-size:12px;font-weight:800;margin-bottom:12px;">EMPLOYMENT PERMIT</div>' +
    '<h1 style="margin:0 0 16px;font-size:21px;color:#163247;">' + escapeHtml(input.heading) + '</h1>' +
    input.paragraphs.map((p) => '<p style="font-size:15px;line-height:1.6;color:#243039;margin:0 0 14px;">' + escapeHtml(p) + '</p>').join('') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border-top:1px solid #d7e1e6;border-bottom:1px solid #d7e1e6;">' + rowsHtml + '</table>' +
    ctaHtml +
    '<p style="font-size:15px;line-height:1.6;color:#243039;margin-top:18px;">' + escapeHtml(input.closing).replace(/
/g, '<br/>') + '</p></div>' +
    '<div style="padding:18px 28px 24px;border-top:1px solid #d7e1e6;font-size:12px;line-height:1.6;color:#66717a;">Bimed Healthcare Limited · Dublin, Ireland<br/>Recruitment: ' +
    escapeHtml(recruitmentContacts.ireland) + ' · Admin: ' + escapeHtml(recruitmentContacts.admin) + '</div></div></body></html>';
  const text = [
    input.heading,
    '',
    ...input.paragraphs,
    '',
    ...input.rows.map((row) => row.label + ': ' + row.value),
    ctaUrl && input.ctaLabel ? input.ctaLabel + ': ' + ctaUrl : '',
    '',
    input.closing,
    '',
    'Bimed Healthcare Limited, Dublin, Ireland',
    'Recruitment: ' + recruitmentContacts.ireland + ' | Admin: ' + recruitmentContacts.admin,
  ].filter(Boolean).join('
');
  return { subject: sanitizeSubject(input.subject), html, text };
}

export function detePermitContractReadyToSignEmail(input: {
  application: ApplicationLike;
  signUrl: string;
  primaryAssignment: string;
  expiresAt: string;
}): EmailContent {
  return buildEmail({
    subject: 'Bimed Healthcare | Permit-stage employment contract ready to sign',
    heading: 'Your permit-stage employment contract is ready',
    preheader: 'Review and sign the final BIMED employment contract prepared for the Irish employment permit application.',
    paragraphs: [
      'Dear ' + input.application.full_name + ',',
      'Your separate permit-stage employment contract has been prepared by Bimed Healthcare for the Irish employment permit application. This is issued after the earlier recruitment and onboarding contract and does not replace that document.',
      'Please review the complete contract before signing. The signing page records your electronic signature against the exact document snapshot issued to you.',
    ],
    rows: [
      { label: 'Position', value: input.application.role_applied || 'To be confirmed' },
      { label: 'Place of Primary Assignment', value: input.primaryAssignment },
      { label: 'Signing link expiry', value: new Date(input.expiresAt).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }) },
    ],
    ctaLabel: 'Review and sign permit-stage contract',
    ctaUrl: input.signUrl,
    closing: 'Kind regards,
Bimed Healthcare Recruitment Team',
  });
}

export function adminDetePermitContractSignedEmail(input: {
  application: ApplicationLike;
  signedName: string;
  signedAt: string;
  signatureId: string;
}): EmailContent {
  return buildEmail({
    subject: 'Bimed Healthcare | Permit-stage contract signed',
    heading: 'Permit-stage employment contract signed',
    preheader: 'A candidate has electronically signed the permit-stage employment contract.',
    paragraphs: [
      'The permit-stage employment contract has been electronically signed and retained in the BIMED recruitment record.',
    ],
    rows: [
      { label: 'Candidate', value: input.application.full_name },
      { label: 'Position', value: input.application.role_applied || 'To be confirmed' },
      { label: 'Signed by', value: input.signedName },
      { label: 'Signed at', value: new Date(input.signedAt).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }) },
      { label: 'Signature record', value: input.signatureId },
    ],
    closing: 'Bimed Healthcare Recruitment Portal',
  });
}
