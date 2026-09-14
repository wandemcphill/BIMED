import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureStaffMailbox } from '@/lib/staff-messaging';
import { getAppUrl } from '@/lib/email';
import { sendTransactionalEmail } from '@/lib/email/transport';
import type { EmailContent } from '@/lib/email/templates';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'To be confirmed';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IE', { dateStyle: 'long' });
}

export async function sendStaffPortalActivationEmail(
  client: SupabaseClient,
  staff: any,
  token: string,
  recipientEmail?: string | null,
) {
  const mailbox = await ensureStaffMailbox(client, staff);
  const address = `${mailbox.handle}@${mailbox.namespace}`;
  const activationUrl = `${getAppUrl()}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(staff.email)}`;
  const portalUrl = `${getAppUrl()}/staff`;
  const name = staff.preferred_name || staff.full_name;
  const role = staff.job_title || staff.role || 'BIMED Staff';
  const statusLabel = staff.status === 'pre_arrival' ? 'Pre-arrival' : 'Active';
  const startDate = displayDate(staff.employment_start_date);
  const deliveryAddress = recipientEmail?.trim().toLowerCase() || staff.email;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f3f7f9;font-family:Arial,sans-serif;color:#243039">
  <div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #d7e1e6;border-radius:10px;overflow:hidden">
    <div style="padding:22px 28px;background:#163247;color:#fff"><div style="font-size:18px;font-weight:700">Bimed Healthcare</div><div style="font-size:12px;color:#a9c4d4;margin-top:4px">Love. Care. Comfort.</div></div>
    <div style="padding:28px">
      <div style="font-size:12px;font-weight:800;letter-spacing:1.2px;color:#0a8ec6">NEW HIRE WELCOME</div>
      <h1 style="font-size:24px;color:#163247;margin:6px 0 16px">Welcome to BIMED Healthcare</h1>
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your permanent BIMED staff account is now ready. Welcome to the team.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border-top:1px solid #d7e1e6;border-bottom:1px solid #d7e1e6">
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">Position</td><td style="padding:9px 0">${escapeHtml(role)}</td></tr>
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">BIMED ID</td><td style="padding:9px 0">${escapeHtml(String(staff.bimed_id))}</td></tr>
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">BIMED email</td><td style="padding:9px 0">${escapeHtml(String(staff.email))}</td></tr>
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">Start date</td><td style="padding:9px 0">${escapeHtml(startDate)}</td></tr>
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">Employment status</td><td style="padding:9px 0">${escapeHtml(statusLabel)}</td></tr>
        <tr><td style="padding:9px 0;font-weight:700;color:#66717a">BIMED internal address</td><td style="padding:9px 0">${escapeHtml(address)}</td></tr>
      </table>
      <div style="background:#e8f4f8;border-left:4px solid #0a8ec6;border-radius:4px;padding:14px 16px;line-height:1.6"><strong>Your first step:</strong> open the activation link, create a password of at least 10 characters, then use your <strong>BIMED ID</strong> or <strong>BIMED email</strong> to sign in.</div>
      <p><a href="${escapeHtml(activationUrl)}" style="display:inline-block;background:#0a8ec6;color:#fff;padding:13px 20px;border-radius:7px;text-decoration:none;font-weight:800">Activate your Staff Portal</a></p>
      <h2 style="font-size:18px;color:#163247;margin:24px 0 10px">How your Staff Portal works</h2>
      <ul style="padding-left:20px;line-height:1.65">
        <li><strong>Overview:</strong> see your BIMED identity, work status and key workforce information.</li>
        <li><strong>Messages:</strong> send private messages to BIMED Admin / HR and read their replies.</li>
        <li><strong>My Rota:</strong> view assigned shifts and use the shift workspace for available work and requests.</li>
        <li><strong>Attendance:</strong> record and review your attendance information.</li>
        <li><strong>Payslips:</strong> view your payslips when they are issued.</li>
        <li><strong>My Profile:</strong> keep your phone, address and Irish payroll details up to date, and upload your profile photograph.</li>
        ${staff.application_id ? '<li><strong>Onboarding:</strong> review your recruitment-linked onboarding readiness and any outstanding compliance items.</li>' : ''}
        <li><strong>Notifications:</strong> keep up with rota, payroll, training and workplace notices.</li>
      </ul>
      <div style="background:#fff8e1;border-left:4px solid #c98a00;border-radius:4px;padding:14px 16px;line-height:1.6;margin-top:20px"><strong>Profile picture:</strong> after you activate your account, open My Profile and upload a clear recent photograph for your BIMED profile picture.</div>
      <p style="margin-top:22px"><a href="${escapeHtml(portalUrl)}" style="color:#0a8ec6;font-weight:800">Open the BIMED Staff Portal</a></p>
      <p style="color:#66717a;font-size:13px;margin-top:24px">Never share your activation link or password. BIMED staff communications are private to the Staff Portal.</p>
      <p style="margin-top:24px">Welcome to the BIMED team,<br><strong>BIMED Healthcare</strong></p>
    </div>
    <div style="padding:18px 28px 24px;border-top:1px solid #d7e1e6;font-size:12px;line-height:1.6;color:#66717a">Bimed Healthcare Limited · Dublin, Ireland<br>Recruitment: recruitment@bimedhealthcare.com · Admin: info@bimedhealthcare.com</div>
  </div>
</body></html>`;

  const text = [
    'WELCOME TO BIMED HEALTHCARE',
    '',
    `Hello ${name},`,
    '',
    `Your permanent BIMED staff account is now ready for your role as ${role}.`,
    '',
    `Position: ${role}`,
    `BIMED ID: ${staff.bimed_id}`,
    `BIMED email: ${staff.email}`,
    `Start date: ${startDate}`,
    `Employment status: ${statusLabel}`,
    `BIMED internal address: ${address}`,
    '',
    `Activate your Staff Portal: ${activationUrl}`,
    `Open the BIMED Staff Portal: ${portalUrl}`,
    '',
    'After activation, sign in using either your BIMED ID or BIMED email and the password you create.',
    '',
    'Staff Portal guide:',
    '- Overview: see your BIMED identity and key workforce information.',
    '- Messages: contact BIMED Admin / HR and read replies.',
    '- My Rota: view shifts and work requests.',
    '- Attendance: record and review attendance.',
    '- Payslips: view payslips when issued.',
    '- My Profile: maintain contact/payroll details and upload your profile photograph.',
    ...(staff.application_id ? ['- Onboarding: review recruitment-linked onboarding readiness.'] : []),
    '- Notifications: keep up with workforce notices.',
    '',
    'Please upload a clear recent profile photograph on My Profile after activation.',
    'The activation link expires after seven days. Never share it or your password.',
    '',
    'Welcome to the BIMED team,',
    'BIMED Healthcare',
  ].join('\n');

  const content: EmailContent = {
    subject: `Welcome to BIMED Healthcare · ${name}`,
    html,
    text,
  };

  return sendTransactionalEmail({
    to: deliveryAddress,
    content,
    emailType: 'staff_portal_welcome',
    dedupeKey: `staff_portal_welcome:${staff.id}:${staff.activation_token_hash || token}`,
    client,
    replyTo: 'info@bimedhealthcare.com',
  });
}
