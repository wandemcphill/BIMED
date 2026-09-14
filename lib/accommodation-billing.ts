import { randomBytes } from 'crypto';
import { Resend } from 'resend';

export const ACCOMMODATION_TERMS_VERSION = '2026-09-14-v1';
export const ACCOMMODATION_AMOUNT_EUR = 4000;
export const ACCOMMODATION_PERIOD_MONTHS = 3;
export const ACCOMMODATION_REFUND_INSTALLMENTS = 4;

export function makePublicToken() {
  return randomBytes(32).toString('hex');
}

export function makeInvoiceNumber(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const stamp = `${date.getUTCMonth() + 1}`.padStart(2, '0') + `${date.getUTCDate()}`.padStart(2, '0');
  return `BIMED-ACC-${yyyy}-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function makeReceiptNumber(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const stamp = `${date.getUTCMonth() + 1}`.padStart(2, '0') + `${date.getUTCDate()}`.padStart(2, '0');
  return `BIMED-RCP-${yyyy}-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://recruitment.bimedhealthcare.com').replace(/\/$/, '');
}

export async function sendAccommodationEmail(input: { to: string | string[]; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured.');
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM || 'BIMED Healthcare <noreply@bimedhealthcare.com>';
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const result = await resend.emails.send({ from, to, subject: input.subject, html: input.html });
  if (result.error) throw new Error(result.error.message || 'Unable to send email.');
  return result;
}

export function invoiceHtml(input: {
  invoice: any;
  staff: any;
  account?: any;
  publicUrl: string;
}) {
  const account = input.invoice.payment_account_snapshot || input.account || {};
  const accountRows = [
    ['Account name', account.account_name],
    ['Bank', account.bank_name],
    ['IBAN', account.iban],
    ['BIC / SWIFT', account.bic_swift],
    ['Account number', account.account_number],
    ['Sort code', account.sort_code],
    ['Branch', account.branch_details],
    ['Payment reference', account.payment_reference_instructions || input.invoice.invoice_number],
  ].filter(([, value]) => value);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${input.invoice.invoice_number}</title></head><body style="margin:0;background:#f3f6f8;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:760px;margin:32px auto;background:#fff;padding:42px;border:1px solid #e5e7eb;border-radius:14px"><div style="display:flex;justify-content:space-between;gap:24px"><div><div style="font-size:12px;letter-spacing:2px;font-weight:800;color:#0f766e">BIMED HEALTHCARE LIMITED</div><h1 style="margin:8px 0 4px;font-size:30px">Accommodation Invoice</h1><div style="color:#627d98">Three-month initial probationary accommodation arrangement</div></div><div style="text-align:right"><div style="font-size:12px;color:#627d98">Invoice</div><strong>${input.invoice.invoice_number}</strong><div style="margin-top:8px;font-size:12px;color:#627d98">Issue date</div><strong>${input.invoice.issue_date}</strong><div style="margin-top:8px;font-size:12px;color:#627d98">Due date</div><strong>${input.invoice.due_date || 'On receipt'}</strong></div></div><hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0"><div style="display:grid;grid-template-columns:1fr 1fr;gap:28px"><div><div style="font-size:12px;color:#627d98">BILLED TO</div><strong>${input.invoice.bill_to_name || input.staff.full_name}</strong><div>${input.invoice.bill_to_email || ''}</div><div>${input.staff.bimed_id || ''}</div></div><div><div style="font-size:12px;color:#627d98">ARRANGEMENT</div><div>€${Number(input.invoice.amount_eur).toFixed(2)} EUR</div><div>Initial accommodation for ${ACCOMMODATION_PERIOD_MONTHS} months</div><div>Full refund on qualifying refusal under the agreed terms</div><div>Post-probation refund: 4 weekly instalments</div></div></div><table style="width:100%;border-collapse:collapse;margin-top:28px"><thead><tr><th style="text-align:left;padding:12px;border-bottom:1px solid #d9e2ec">Description</th><th style="text-align:right;padding:12px;border-bottom:1px solid #d9e2ec">Amount</th></tr></thead><tbody><tr><td style="padding:16px 12px">${input.invoice.description}</td><td style="padding:16px 12px;text-align:right;font-weight:800">€${Number(input.invoice.amount_eur).toFixed(2)}</td></tr></tbody><tfoot><tr><td style="padding:16px 12px;text-align:right;font-weight:800">TOTAL DUE</td><td style="padding:16px 12px;text-align:right;font-size:20px;font-weight:900">€${Number(input.invoice.amount_eur).toFixed(2)}</td></tr></tfoot></table><section style="margin-top:26px;padding:18px;background:#f8fafc;border-radius:10px"><div style="font-size:12px;font-weight:800;color:#627d98">PAYMENT DETAILS</div>${accountRows.map(([label, value]) => `<div style="display:flex;justify-content:space-between;gap:24px;padding:8px 0;border-bottom:1px solid #e5e7eb"><span>${label}</span><strong>${value}</strong></div>`).join('')}</section><section style="margin-top:24px;color:#627d98;font-size:13px;line-height:1.7"><strong style="color:#334e68">Terms note:</strong> This invoice records the agreed accommodation arrangement. It is not a guarantee of employment permit or visa approval and does not by itself replace any immigration evidence required by the relevant authorities. Keep this invoice and payment evidence for your records.</section><div style="margin-top:24px;text-align:center"><a href="${input.publicUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none">Open invoice online</a></div></main></body></html>`;
}

export function receiptHtml(input: { receipt: any; invoice: any; staff: any; publicUrl: string }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${input.receipt.receipt_number}</title></head><body style="margin:0;background:#f3f6f8;font-family:Arial,sans-serif;color:#172b4d"><main style="max-width:760px;margin:32px auto;background:#fff;padding:42px;border:1px solid #e5e7eb;border-radius:14px"><div style="text-align:center"><div style="font-size:12px;letter-spacing:2px;font-weight:800;color:#0f766e">BIMED HEALTHCARE LIMITED</div><h1 style="margin:8px 0">Payment Receipt</h1><div style="color:#627d98">Receipt ${input.receipt.receipt_number}</div></div><hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0"><div style="display:grid;grid-template-columns:1fr 1fr;gap:24px"><div><div style="font-size:12px;color:#627d98">RECEIVED FROM</div><strong>${input.staff.full_name}</strong><div>${input.staff.bimed_id || ''}</div></div><div><div style="font-size:12px;color:#627d98">PAYMENT</div><div>€${Number(input.receipt.amount_eur).toFixed(2)} ${input.receipt.currency}</div><div>Paid: ${input.receipt.paid_at}</div><div>Method: ${input.receipt.payment_method || 'Bank transfer'}</div><div>Reference: ${input.receipt.payment_reference || '—'}</div></div></div><div style="margin-top:28px;padding:24px;border-radius:12px;background:#ecfdf5;text-align:center"><div style="font-size:13px;color:#047857">PAYMENT RECEIVED</div><div style="font-size:30px;font-weight:900;margin-top:4px">€${Number(input.receipt.amount_eur).toFixed(2)}</div></div><div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:10px"><div style="font-size:12px;color:#627d98">APPLIED TO</div><div>Invoice ${input.invoice.invoice_number}</div><div>${input.invoice.description}</div></div><div style="margin-top:24px;color:#627d98;font-size:13px;line-height:1.6">This receipt confirms that BIMED Healthcare Limited has recorded the payment against the referenced accommodation invoice. The accommodation arrangement and any later refund remain subject to the agreed terms.</div><div style="margin-top:26px;text-align:center"><a href="${input.publicUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none">View receipt</a></div></main></body></html>`;
}
