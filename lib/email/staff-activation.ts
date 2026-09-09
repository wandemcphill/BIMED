import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureStaffMailbox } from '@/lib/staff-messaging';
import { getAppUrl } from '@/lib/email';
import { sendTransactionalEmail } from '@/lib/email/transport';
import type { EmailContent } from '@/lib/email/templates';

function escapeHtml(value: string) { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

export async function sendStaffPortalActivationEmail(client: SupabaseClient, staff: any, token: string) {
  const mailbox = await ensureStaffMailbox(client, staff);
  const address = `${mailbox.handle}@${mailbox.namespace}`;
  const activationUrl = `${getAppUrl()}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(staff.email)}`;
  const name = staff.preferred_name || staff.full_name;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#243039"><p style="color:#0a8ec6;font-weight:800">BIMED HEALTHCARE</p><h1>Your BIMED Personal Portal is ready</h1><p>Hello ${escapeHtml(name)},</p><p>Your employment onboarding has progressed and your private BIMED staff portal is now ready for activation.</p><p><strong>BIMED ID:</strong> ${escapeHtml(staff.bimed_id)}<br><strong>BIMED internal address:</strong> ${escapeHtml(address)}</p><p><a href="${activationUrl}" style="display:inline-block;background:#0a8ec6;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:800">Activate BIMED Portal</a></p><p>Use the portal to manage shifts, view payslips and payroll information, access employment documents and communicate securely within BIMED.</p><p style="color:#66717a">The activation link expires after seven days. Never share your activation link.</p></div>`;
  const content: EmailContent = { subject: 'Activate your BIMED Personal Portal', html, text: `Your BIMED Personal Portal is ready. BIMED ID: ${staff.bimed_id}. BIMED address: ${address}. Activate your account: ${activationUrl}` };
  return sendTransactionalEmail({ to: staff.email, content, emailType: 'onboarding_pack', dedupeKey: `staff_portal_activation:${staff.id}`, client });
}
