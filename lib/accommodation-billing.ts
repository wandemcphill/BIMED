import { randomBytes } from 'crypto';
import { Resend } from 'resend';

export const ACCOMMODATION_TERMS_VERSION = '2026-09-14-v1';
export const ACCOMMODATION_AMOUNT_EUR = 4000;
export const ACCOMMODATION_PERIOD_MONTHS = 3;
export const ACCOMMODATION_REFUND_INSTALLMENTS = 4;
export const ACCOMMODATION_SIGNATORY_NAME = 'Dezou Maurice';
export const ACCOMMODATION_SIGNATORY_TITLE = 'Manager, Bimed Healthcare Limited';
export const ACCOMMODATION_ONLINE_PAYMENT_URL = 'https://www.payssion.com/checkout/live_d5a43be9bff6d1a2';

export const ACCOMMODATION_PAYMENT_ACCOUNT = {
  account_name: 'WEBGEEK TECHNOLOGIES LTD',
  bank_name: 'Banking Circle - German Branch',
  iban: 'DE81202208000048523738',
  bic_swift: 'SXPYDEHH',
  account_number: '00008988',
  sort_code: '04-09-97',
  branch_details: 'UK local account details: Account 00008988 · Sort code 04-09-97',
  payment_reference_instructions: 'Use the BIMED invoice number as the payment reference.',
  currency: 'EUR',
} as const;

export const ACCOMMODATION_TERMS = [
  `The €${ACCOMMODATION_AMOUNT_EUR.toLocaleString('en-IE')} payment covers BIMED-arranged accommodation for the initial ${ACCOMMODATION_PERIOD_MONTHS}-month probationary period.`,
  'The payment is a condition of the BIMED overseas-hire accommodation arrangement and is separate from the employment permit and visa decisions made by the relevant authorities.',
  'Payment of the accommodation amount does not guarantee an employment permit, visa, right to work, entry to Ireland or continued employment, and it does not replace any financial evidence or other documentation an authority may require.',
  'Where the agreed arrangement provides a refund following a permit or visa refusal, the qualifying refusal must be evidenced and the refund is processed in accordance with the applicable BIMED accommodation terms.',
  `Where the employee completes the probationary period successfully, the agreed €${ACCOMMODATION_AMOUNT_EUR.toLocaleString('en-IE')} refund is returned in ${ACCOMMODATION_REFUND_INSTALLMENTS} weekly instalments in accordance with the accommodation terms.`,
  'The invoice, payment evidence and receipt should be retained by the employee as part of their employment and accommodation records.',
];

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

function e(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateOnly(value: unknown) {
  const raw = String(value ?? '');
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-IE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Dublin' });
}

function dateTime(value: unknown) {
  const raw = String(value ?? '');
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Dublin' });
}

function signatureBlock(dateValue: unknown, label: string) {
  return `<section class="signature-block">
    <div class="signature-caption">${e(label)}</div>
    <div class="signature-name">${e(ACCOMMODATION_SIGNATORY_NAME)}</div>
    <div class="signature-rule"></div>
    <div class="signature-title">${e(ACCOMMODATION_SIGNATORY_TITLE)}</div>
    <div class="signature-meta">Electronically authorised · Date: ${e(dateOnly(dateValue))}</div>
  </section>`;
}

function termsSection(invoice?: any) {
  const snapshot = invoice?.arrangement_snapshot || {};
  const plan = snapshot.accommodation_plan || null;
  const amount = Number(invoice?.amount_eur || snapshot.accommodation_amount_eur || ACCOMMODATION_AMOUNT_EUR);
  const periodMonths = Number(snapshot.accommodation_period_months || ACCOMMODATION_PERIOD_MONTHS);
  const refundTrigger = snapshot.accommodation_refund_trigger || 'successful_three_month_probation';
  const shared = plan === 'one_month_shared_625';
  const terms = [
    `The €${amount.toLocaleString('en-IE')} payment covers BIMED-arranged ${shared ? 'shared ' : ''}accommodation for ${periodMonths === 1 ? 'the first month' : 'the initial three-month probationary period'}.`,
    'The payment is a condition of the BIMED overseas-hire accommodation arrangement and is separate from the employment permit and visa decisions made by the relevant authorities.',
    'Payment of the accommodation amount does not guarantee an employment permit, visa, right to work, entry to Ireland or continued employment, and it does not replace any financial evidence or other documentation an authority may require.',
    refundTrigger === 'one_month_accommodation_expiry'
      ? `The agreed €${amount.toLocaleString('en-IE')} refund is processed when the one-month accommodation arrangement expires, in accordance with the applicable accommodation terms.`
      : `Where the employee completes the probationary period successfully, the agreed €${amount.toLocaleString('en-IE')} refund is returned in ${Number(snapshot.accommodation_refund_installments || ACCOMMODATION_REFUND_INSTALLMENTS)} weekly instalments in accordance with the accommodation terms.`,
    'The invoice, payment evidence and receipt should be retained by the employee as part of their employment and accommodation records.',
  ];
  return `<section class="terms-section">
    <div class="section-kicker">TERMS & CONDITIONS · VERSION ${e(ACCOMMODATION_TERMS_VERSION)}</div>
    <h2>Accommodation arrangement terms</h2>
    <ol>${terms.map((term) => `<li>${e(term)}</li>`).join('')}</ol>
  </section>`;
}

function documentStyles() {
  return `<style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin:0; background:#edf2f5; color:#172b4d; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet { max-width:820px; margin:24px auto; background:#fff; border:1px solid #dfe7ec; box-shadow:0 18px 50px rgba(16,47,68,.10); }
    .inner { padding:44px 46px 42px; }
    .topline { height:6px; background:linear-gradient(90deg,#163247,#0f766e,#0a8ec6); }
    .masthead { display:flex; justify-content:space-between; gap:28px; align-items:flex-start; }
    .brand { letter-spacing:2px; font-size:12px; font-weight:900; color:#0f766e; }
    .company { margin-top:8px; font-size:28px; line-height:1.05; font-weight:900; color:#163247; }
    .tagline { margin-top:8px; color:#627d98; font-size:13px; }
    .doc-title { text-align:right; }
    .doc-title h1 { margin:0; font-size:30px; color:#163247; }
    .doc-label { margin-top:8px; color:#627d98; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .doc-number { margin-top:5px; font-weight:900; color:#0f766e; }
    .rule { height:1px; background:#dfe7ec; margin:28px 0; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    .panel { border:1px solid #dfe7ec; border-radius:12px; padding:16px; background:#f9fbfc; }
    .kicker { color:#627d98; font-size:11px; font-weight:900; letter-spacing:.08em; }
    .panel strong { display:block; margin-top:6px; font-size:15px; color:#163247; }
    .panel p { margin:5px 0 0; color:#334e68; font-size:13px; line-height:1.5; }
    .summary { margin-top:22px; border-radius:12px; overflow:hidden; border:1px solid #dfe7ec; }
    .summary table { width:100%; border-collapse:collapse; }
    .summary th, .summary td { padding:13px 14px; border-bottom:1px solid #e8eef1; text-align:left; font-size:13px; }
    .summary th:last-child, .summary td:last-child { text-align:right; }
    .summary th { background:#f4f8f9; color:#627d98; font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
    .summary .total td { border-bottom:0; font-size:16px; font-weight:900; color:#163247; background:#f7fbfa; }
    .payment { margin-top:22px; }
    .payment h2, .terms-section h2 { margin:0 0 10px; font-size:18px; color:#163247; }
    .payment-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px 22px; padding:16px; background:#f7fafb; border:1px solid #dfe7ec; border-radius:12px; }
    .payment-row { display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid #e4eaee; padding:7px 0; font-size:12px; }
    .payment-row:nth-last-child(-n+2) { border-bottom:0; }
    .payment-row span { color:#627d98; }
    .payment-row strong { text-align:right; overflow-wrap:anywhere; }
    .terms-section { margin-top:28px; padding-top:22px; border-top:1px solid #dfe7ec; }
    .section-kicker { color:#0f766e; font-size:11px; font-weight:900; letter-spacing:.08em; }
    .terms-section ol { margin:12px 0 0; padding-left:22px; color:#334e68; }
    .terms-section li { margin:0 0 9px; font-size:12px; line-height:1.55; }
    .notice { margin-top:20px; padding:14px 16px; border:1px solid #cfe3e3; background:#eef7f7; border-radius:12px; color:#334e68; font-size:12px; line-height:1.55; }
    .signature-block { margin-top:28px; width:320px; max-width:100%; }
    .signature-caption { color:#627d98; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
    .signature-name { margin-top:16px; font-family:"Brush Script MT","Segoe Script",cursive; font-size:30px; color:#163247; }
    .signature-rule { height:1px; background:#163247; margin-top:2px; }
    .signature-title { margin-top:7px; font-size:12px; font-weight:800; color:#334e68; }
    .signature-meta { margin-top:4px; color:#627d98; font-size:11px; }
    .status-box { margin-top:20px; padding:18px; border-radius:12px; text-align:center; background:#ecfdf5; border:1px solid #b7ead0; }
    .status-box .label { color:#047857; font-size:11px; font-weight:900; letter-spacing:.1em; }
    .status-box .amount { margin-top:5px; font-size:29px; font-weight:900; color:#065f46; }
    .footer { margin-top:28px; padding-top:14px; border-top:1px solid #e4eaee; color:#78909c; font-size:10px; line-height:1.5; }
    .button { display:inline-block; margin-top:22px; padding:11px 16px; border-radius:8px; background:#0f766e; color:#fff; text-decoration:none; font-size:12px; font-weight:800; }
    @media (max-width:700px) { .inner { padding:28px 22px 30px; } .masthead { flex-direction:column; } .doc-title { text-align:left; } .meta-grid, .payment-grid { grid-template-columns:1fr; } .payment-row:nth-last-child(-n+2) { border-bottom:1px solid #e4eaee; } .payment-row:last-child { border-bottom:0; } }
    @media print { body { background:#fff; } .sheet { margin:0; max-width:none; border:0; box-shadow:none; } .button { display:none; } }
  </style>`;
}

export function invoiceHtml(input: { invoice: any; staff: any; account?: any; publicUrl: string }) {
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

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(input.invoice.invoice_number)} · BIMED Healthcare</title>${documentStyles()}</head><body>
    <main class="sheet"><div class="topline"></div><div class="inner">
      <header class="masthead">
        <div><div class="brand">BIMED HEALTHCARE LIMITED</div><div class="company">Bimed Healthcare Limited</div><div class="tagline">Love. Care. Comfort. · Accommodation Billing</div></div>
        <div class="doc-title"><h1>Accommodation Invoice</h1><div class="doc-label">Invoice number</div><div class="doc-number">${e(input.invoice.invoice_number)}</div><div class="doc-label">Issue date</div><div>${e(dateOnly(input.invoice.issued_at || input.invoice.issue_date))}</div><div class="doc-label">Due date</div><div>${e(input.invoice.due_date ? dateOnly(input.invoice.due_date) : 'On receipt')}</div></div>
      </header>
      <div class="rule"></div>
      <div class="meta-grid">
        <div class="panel"><div class="kicker">BILLED TO</div><strong>${e(input.invoice.bill_to_name || input.staff.full_name)}</strong><p>${e(input.invoice.bill_to_email || input.staff.email || '')}</p><p>BIMED ID: ${e(input.staff.bimed_id || '')}</p></div>
        <div class="panel"><div class="kicker">ARRANGEMENT</div><strong>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR</strong><p>Initial BIMED-arranged ${input.invoice.arrangement_snapshot?.accommodation_plan === 'one_month_shared_625' ? 'shared ' : ''}accommodation for ${Number(input.invoice.arrangement_snapshot?.accommodation_period_months || ACCOMMODATION_PERIOD_MONTHS) === 1 ? 'the first month' : 'the probationary period'}.</p></div>
      </div>
      <div class="summary"><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>${e(input.invoice.description)}</td><td>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</td></tr></tbody><tfoot><tr class="total"><td>TOTAL DUE</td><td>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</td></tr></tfoot></table></div>
      <section class="payment"><h2>Payment details</h2><div class="payment-grid">${accountRows.map(([label, value]) => `<div class="payment-row"><span>${e(label)}</span><strong>${e(value)}</strong></div>`).join('')}</div></section>
      ${termsSection(input.invoice)}
      <div class="notice"><strong>Important:</strong> This accommodation arrangement is separate from the employment permit and visa decisions made by the relevant authorities. Payment does not guarantee permit approval, visa approval, entry to Ireland, right to work or continued employment.</div>
      ${signatureBlock(input.invoice.issued_at || input.invoice.issue_date, 'Authorised by')}
      <a class="button" href="${e(input.publicUrl)}">Open invoice online</a>
      <div class="footer">Document version: ${e(ACCOMMODATION_TERMS_VERSION)} · Retain this invoice and subsequent payment receipt for your records.</div>
    </div></main>
  </body></html>`;
}

export function receiptHtml(input: { receipt: any; invoice: any; staff: any; publicUrl: string }) {
  const receiptDate = input.receipt.issued_at || input.receipt.created_at || input.receipt.paid_at;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(input.receipt.receipt_number)} · BIMED Healthcare</title>${documentStyles()}</head><body>
    <main class="sheet"><div class="topline"></div><div class="inner">
      <header class="masthead">
        <div><div class="brand">BIMED HEALTHCARE LIMITED</div><div class="company">Bimed Healthcare Limited</div><div class="tagline">Love. Care. Comfort. · Payment Records</div></div>
        <div class="doc-title"><h1>Payment Receipt</h1><div class="doc-label">Receipt number</div><div class="doc-number">${e(input.receipt.receipt_number)}</div><div class="doc-label">Receipt date</div><div>${e(dateOnly(receiptDate))}</div></div>
      </header>
      <div class="rule"></div>
      <div class="meta-grid">
        <div class="panel"><div class="kicker">RECEIVED FROM</div><strong>${e(input.staff.full_name)}</strong><p>BIMED ID: ${e(input.staff.bimed_id || '')}</p><p>${e(input.staff.email || '')}</p></div>
        <div class="panel"><div class="kicker">PAYMENT</div><strong>€${Number(input.receipt.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} ${e(input.receipt.currency)}</strong><p>Paid: ${e(dateTime(input.receipt.paid_at))}</p><p>Method: ${e(input.receipt.payment_method || 'Bank transfer')}</p><p>Reference: ${e(input.receipt.payment_reference || 'Not provided')}</p></div>
      </div>
      <div class="status-box"><div class="label">PAYMENT RECEIVED</div><div class="amount">€${Number(input.receipt.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</div></div>
      <section class="payment"><h2>Applied to</h2><div class="panel"><div class="kicker">INVOICE</div><strong>${e(input.invoice.invoice_number)}</strong><p>${e(input.invoice.description)}</p></div></section>
      ${termsSection(input.invoice)}
      <div class="notice"><strong>Receipt status:</strong> This document confirms that BIMED Healthcare Limited has recorded and receipted the payment against the referenced accommodation invoice. The agreed refund arrangements remain governed by the accommodation terms shown above.</div>
      ${signatureBlock(receiptDate, 'Receipt authorised by')}
      <a class="button" href="${e(input.publicUrl)}">View receipt online</a>
      <div class="footer">Receipt generated automatically when payment was confirmed. Document version: ${e(ACCOMMODATION_TERMS_VERSION)}.</div>
    </div></main>
  </body></html>`;
}
