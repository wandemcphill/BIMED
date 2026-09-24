import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppUrl } from '@/lib/email';
import { sendTransactionalEmail } from '@/lib/email/transport';
import type { EmailContent } from '@/lib/email/templates';

type StaffAccessEmailRecord = {
  id: string;
  application_id?: string | null;
  full_name: string;
  preferred_name?: string | null;
  email: string;
  bimed_id: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] as string);
}

function buildContent(input: {
  restored: boolean;
  staff: StaffAccessEmailRecord;
  restrictionMessage?: string | null;
}): EmailContent {
  const name = input.staff.preferred_name?.trim() || input.staff.full_name;
  const portalUrl = `${getAppUrl()}/staff`;
  const heading = input.restored
    ? 'Your BIMED Staff Portal access has been restored'
    : 'Your BIMED Staff Portal access has been temporarily restricted';
  const subject = input.restored
    ? 'BIMED Staff Portal Access Restored'
    : 'Important: BIMED Staff Portal Access Restricted';
  const restrictedCopy = input.restrictionMessage?.trim()
    ? `<div style="background:#fff8e1;border-left:4px solid #c98a00;border-radius:6px;padding:14px 16px;line-height:1.6;margin:20px 0"><strong>Reason recorded:</strong><br/>${escapeHtml(input.restrictionMessage)}</div>`
    : '';
  const bodyHtml = input.restored
    ? '<p>Your Staff Portal access has now been restored. You can sign in again using your existing BIMED ID or BIMED email and the password already associated with your account.</p>'
    : `<p>Your Staff Portal access has been temporarily restricted. Your BIMED staff record remains on file while the restriction is in place.</p>${restrictedCopy}<p>Once BIMED confirms that the outstanding requirement has been resolved, your Staff Portal access can be restored.</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>${escapeHtml(heading)}</title></head><body style="margin:0;padding:0;background:#f3f7f9;font-family:Arial,sans-serif;color:#243039;-webkit-font-smoothing:antialiased"><div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #d7e1e6;border-radius:10px;overflow:hidden"><div style="padding:22px 28px;background:#163247;color:#fff"><div style="font-size:18px;font-weight:700">Bimed Healthcare</div><div style="font-size:12px;color:#a9c4d4;margin-top:4px">Love. Care. Comfort.</div></div><div style="padding:28px"><div style="font-size:12px;font-weight:800;letter-spacing:1.2px;color:#0a8ec6">STAFF PORTAL ACCESS</div><h1 style="font-size:24px;line-height:1.3;color:#163247;margin:6px 0 16px">${escapeHtml(heading)}</h1><p>Hello ${escapeHtml(name)},</p>${bodyHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border-top:1px solid #d7e1e6;border-bottom:1px solid #d7e1e6"><tr><td style="padding:9px 0;font-weight:700;color:#66717a">BIMED ID</td><td style="padding:9px 0">${escapeHtml(input.staff.bimed_id)}</td></tr><tr><td style="padding:9px 0;font-weight:700;color:#66717a">BIMED email</td><td style="padding:9px 0">${escapeHtml(input.staff.email)}</td></tr></table><p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#0a8ec6;color:#fff;padding:13px 20px;border-radius:7px;text-decoration:none;font-weight:800">${input.restored ? 'Open Staff Portal' : 'Staff Portal'}</a></p><p style="color:#66717a;font-size:13px;line-height:1.6;margin-top:24px">If you believe this notice is incorrect or need clarification, please contact BIMED at <a href="mailto:info@bimedhealthcare.com" style="color:#0a8ec6;font-weight:700">info@bimedhealthcare.com</a>.</p><p style="margin-top:24px">BIMED Healthcare</p></div><div style="padding:18px 28px 24px;border-top:1px solid #d7e1e6;font-size:12px;line-height:1.6;color:#66717a">Bimed Healthcare Limited · Dublin, Ireland<br/>Recruitment: recruitment@bimedhealthcare.com · Admin: info@bimedhealthcare.com</div></div></body></html>`;
  const text = [
    input.restored ? 'BIMED STAFF PORTAL ACCESS RESTORED' : 'IMPORTANT: BIMED STAFF PORTAL ACCESS RESTRICTED',
    '',
    `Hello ${name},`,
    '',
    input.restored
      ? 'Your Staff Portal access has now been restored. You can sign in again using your existing BIMED ID or BIMED email and your existing password.'
      : 'Your Staff Portal access has been temporarily restricted. Your BIMED staff record remains on file while the restriction is in place.',
    ...(!input.restored && input.restrictionMessage ? ['', 'Reason recorded:', input.restrictionMessage] : []),
    ...(!input.restored ? ['', 'Once BIMED confirms that the outstanding requirement has been resolved, your Staff Portal access can be restored.'] : []),
    '',
    `BIMED ID: ${input.staff.bimed_id}`,
    `BIMED email: ${input.staff.email}`,
    `Staff Portal: ${portalUrl}`,
    '',
    'Questions or corrections: info@bimedhealthcare.com',
    '',
    'BIMED Healthcare',
  ].join('\n');
  return { subject, html, text };
}

export async function sendStaffPortalAccessRestrictedEmail(client: SupabaseClient, staff: StaffAccessEmailRecord, sessionVersion: number, restrictionMessage?: string | null) {
  return sendTransactionalEmail({
    to: staff.email,
    content: buildContent({ restored: false, staff, restrictionMessage }),
    emailType: 'staff_portal_access_restricted',
    dedupeKey: `staff_portal_access_restricted:${staff.id}:v${sessionVersion}`,
    applicationId: staff.application_id,
    client,
    replyTo: 'info@bimedhealthcare.com',
  });
}

export async function sendStaffPortalAccessRestoredEmail(client: SupabaseClient, staff: StaffAccessEmailRecord, sessionVersion: number) {
  return sendTransactionalEmail({
    to: staff.email,
    content: buildContent({ restored: true, staff }),
    emailType: 'staff_portal_access_restored',
    dedupeKey: `staff_portal_access_restored:${staff.id}:v${sessionVersion}`,
    applicationId: staff.application_id,
    client,
    replyTo: 'info@bimedhealthcare.com',
  });
}
