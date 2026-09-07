import type { SupabaseClient } from '@supabase/supabase-js';
import { recruitmentContacts } from '@/lib/recruitment-config';
import { sendTransactionalEmail, type SendResult } from '@/lib/email/transport';

type Application = { id: string; full_name: string; email: string; role_applied?: string | null };

type Link = { label: string; url: string };

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]!);
}

export async function sendFullOnboardingPackEmail(input: {
  application: Application;
  contractSignUrl: string;
  jobDescriptionUrl: string;
  handbookUrl: string;
  packetLinks: Link[];
  packId: string;
}, client?: SupabaseClient | null): Promise<SendResult> {
  const links: Link[] = [
    { label: 'Review and sign your employment contract', url: input.contractSignUrl },
    { label: 'Review and sign your job description', url: input.jobDescriptionUrl },
    { label: 'Review and sign the employee handbook', url: input.handbookUrl },
    ...input.packetLinks,
  ];
  const linkHtml = links.map((link) => `<p style="margin:0 0 12px"><a href="${escapeHtml(link.url)}" style="display:inline-block;padding:11px 16px;background:#0a8ec6;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">${escapeHtml(link.label)}</a></p>`).join('');
  const subject = 'Your Bimed Healthcare employment and onboarding pack';
  const text = [
    'BIMED HEALTHCARE', '',
    `Dear ${input.application.full_name},`,
    '',
    'Your BIMED employment and onboarding pack is ready.',
    `Position: ${input.application.role_applied || 'To be confirmed'}`,
    '',
    ...links.map((link) => `${link.label}: ${link.url}`),
    '',
    'Please review each document carefully. International candidates should complete the sponsorship and relocation materials supplied by BIMED before travelling.',
    `Recruitment: ${recruitmentContacts.ireland}`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7f9;font-family:Arial,sans-serif;color:#243039"><div style="max-width:620px;margin:30px auto;background:#fff;border:1px solid #d7e1e6;border-radius:10px;overflow:hidden"><div style="background:#163247;color:#fff;padding:22px 26px"><strong style="font-size:19px">Bimed Healthcare</strong><div style="font-size:12px;color:#a9c4d4;margin-top:4px">Love. Care. Comfort.</div></div><div style="padding:28px"><h1 style="font-size:22px;color:#163247;margin:0 0 16px">Your onboarding documents are ready</h1><p>Dear ${escapeHtml(input.application.full_name)},</p><p>Your BIMED employment and onboarding pack is ready. Please review each document carefully before your start date.</p><p><strong>Position:</strong> ${escapeHtml(input.application.role_applied || 'To be confirmed')}</p>${linkHtml}<div style="background:#e8f4f8;border-left:4px solid #0a8ec6;padding:14px;margin-top:22px"><strong>Important:</strong> International candidates should complete the sponsorship and relocation materials supplied by BIMED before travelling. Immigration, tax and legal decisions remain subject to the relevant authorities and approved BIMED guidance.</div><p style="font-size:12px;color:#66717a;margin-top:22px">Never send passwords, PINs, banking security codes or one-time authentication codes by email.</p><p>Kind regards,<br/>Bimed Healthcare Recruitment Team</p></div><div style="padding:18px 26px;border-top:1px solid #d7e1e6;font-size:12px;color:#66717a">Bimed Healthcare Limited · Dublin, Ireland<br/>Recruitment: ${escapeHtml(recruitmentContacts.ireland)} · Admin: ${escapeHtml(recruitmentContacts.admin)}</div></div></body></html>`;
  return sendTransactionalEmail({
    to: input.application.email,
    content: { subject, html, text },
    emailType: 'onboarding_pack',
    dedupeKey: `onboarding_pack:${input.packId}`,
    applicationId: input.application.id,
    client,
    replyTo: recruitmentContacts.ireland,
  });
}
