import type { ApplicationEmailRecord } from './index';
import { recruitmentContacts } from '../recruitment-config';

export function contractDocumentCopyEmail(input: {
  candidateName: string;
  role: string | null | undefined;
  documentUrl: string;
  signed: boolean;
}): { subject: string; html: string; text: string } {
  const state = input.signed ? 'Signed' : 'Unsigned';
  const subject = `BIMED Healthcare | ${state} Employment Contract Copy`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
      <h2>BIMED Healthcare</h2>
      <p>Dear ${escapeHtml(input.candidateName)},</p>
      <p>Please use the secure link below to view your ${state.toLowerCase()} employment contract copy.</p>
      <p><a href="${escapeAttr(input.documentUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">Open contract copy</a></p>
      <p>You can print or save the document as a PDF from the contract page.</p>
      <p>If you have any questions, please contact ${recruitmentContacts.ireland}.</p>
      <p>Kind regards,<br>BIMED Healthcare<br>Recruitment &amp; Staff Support</p>
    </div>`;
  const text = `Dear ${input.candidateName},

Please use the secure link below to view your ${state.toLowerCase()} employment contract copy:
${input.documentUrl}

You can print or save the document as a PDF from the contract page.

BIMED Healthcare
Recruitment & Staff Support
`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] || char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
