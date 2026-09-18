import {
  ACCOMMODATION_OPTIONS_TERMS_VERSION,
  accommodationPlanLabel,
  legacyAccommodationSelection,
  permitSubmissionLabel,
  permitTypeLabel,
  type AccommodationPermitSelection,
} from '@/lib/employment-permit-options';
import { ACCOMMODATION_PAYMENT_ACCOUNT, ACCOMMODATION_SIGNATORY_NAME, ACCOMMODATION_SIGNATORY_TITLE, appUrl } from '@/lib/accommodation-billing';

function e(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
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

function selectionForInvoice(invoice: any): any {
  const snapshot = invoice?.arrangement_snapshot;
  if (snapshot && typeof snapshot === 'object' && snapshot.accommodation_plan) return snapshot;
  return legacyAccommodationSelection(null, null);
}

function termsForSelection(selection: any): string[] {
  if (selection.terms_version === '2026-09-14-v1' || selection.legacy === true && selection.accommodation_plan === 'three_months_4000') {
    return [
      'The €4,000 payment covers BIMED-arranged accommodation for the initial 3-month probationary period.',
      'The payment is a condition of the BIMED overseas-hire accommodation arrangement and is separate from the employment permit and visa decisions made by the relevant authorities.',
      'Payment of the accommodation amount does not guarantee an employment permit, visa, right to work, entry to Ireland or continued employment, and it does not replace any financial evidence or other documentation an authority may require.',
      'Where the agreed arrangement provides a refund following a permit or visa refusal, the qualifying refusal must be evidenced and the refund is processed in accordance with the applicable BIMED accommodation terms.',
      'Where the employee completes the probationary period successfully, the agreed €4,000 refund is returned in 4 weekly instalments in accordance with the accommodation terms.',
      'The invoice, payment evidence and receipt should be retained by the employee as part of their employment and accommodation records.',
    ];
  }

  const terms = [
    `The €${Number(selection.accommodation_amount_eur).toLocaleString('en-IE')} payment covers ${selection.accommodation_period_months === 1 ? 'BIMED-arranged accommodation for the first month' : `BIMED-arranged accommodation for the initial ${selection.accommodation_period_months}-month probationary period`}.`,
    selection.accommodation_plan === 'one_month_1250'
      ? 'During the first month, the employee completes training, onboarding and shadow shifting with BIMED. After the one-month arrangement expires, the employee arranges and pays for their own accommodation in Ireland.'
      : 'The three-month arrangement covers the initial probationary period and related onboarding transition.',
    'The accommodation payment is separate from employment permit and visa decisions. It does not guarantee permit approval, visa approval, right to work, entry to Ireland or continued employment.',
  ];

  if (selection.accommodation_refund_trigger === 'successful_three_month_probation') {
    terms.push(`Where the qualifying trigger is successful completion of the three-month probationary period, the €${Number(selection.accommodation_amount_eur).toLocaleString('en-IE')} refund is returned in 4 weekly instalments in accordance with the accommodation terms.`);
  } else {
    terms.push(`Where the permit route is candidate or recruitment-agency paid, the €${Number(selection.accommodation_amount_eur).toLocaleString('en-IE')} refund trigger is expiry of the one-month accommodation arrangement. Refund processing and payment mechanics are governed by the applicable accommodation terms and evidence requirements.`);
  }

  terms.push(
    selection.permit_submission_route === 'bimed_legal_team'
      ? 'BIMED legal team submits and pays the employment permit application on behalf of the candidate. The permit fee is not recovered through salary deduction or repayment.'
      : 'The candidate or recruitment agency submits and pays the employment permit application directly.',
    `The planned employment permit application fee for the recorded route is €${Number(selection.permit_fee_eur || 1000).toLocaleString('en-IE')}. Irish immigration registration is normally €300 where a registration fee applies, subject to current ISD rules and exemptions.` ,
    'The invoice, payment evidence and receipt should be retained by the employee as part of their employment and accommodation records.',
  );

  return terms;
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

function documentStyles() {
  return `<style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin:0; background:#edf2f5; color:#172b4d; font-family:Arial,Helvetica,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet { max-width:820px; margin:24px auto; background:#fff; border:1px solid #dfe7ec; box-shadow:0 18px 50px rgba(16,47,68,.10); }
    .inner { padding:44px 46px 42px; }
    .topline { height:6px; background:linear-gradient(90deg,#163247,#0f766e,#0a8ec6); }
    .masthead { display:flex; justify-content:space-between; gap:28px; align-items:flex-start; }
    .brand { letter-spacing:2px; font-size:12px; font-weight:900; color:#0f766e; }
    .company { margin-top:8px; font-size:28px; line-height:1.05; font-weight:900; color:#163247; }
    .tagline { margin-top:8px; color:#627d98; font-size:13px; }
    .doc-title { text-align:right; }
    .doc-title h1 { margin:0; font-size:30px; color:#163247; }
    .doc-label { margin-top:8px; color:#627d98; font-size:12px; font-weight:800; }
    .doc-number { margin-top:5px; font-weight:900; color:#0f766e; }
    .rule { height:1px; background:#dfe7ec; margin:28px 0; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    .panel { border:1px solid #dfe7ec; border-radius:12px; padding:16px; background:#f9fbfc; }
    .kicker { color:#627d98; font-size:11px; font-weight:900; letter-spacing:.08em; }
    .panel strong { display:block; margin-top:6px; font-size:15px; color:#163247; }
    .panel p { margin:5px 0 0; color:#334e68; font-size:13px; line-height:1.5; }
    .summary { margin-top:22px; border-radius:12px; overflow:hidden; border:1px solid #dfe7ec; }
    .summary table { width:100%; border-collapse:collapse; }
    .summary th,.summary td { padding:13px 14px; border-bottom:1px solid #e8eef1; text-align:left; font-size:13px; }
    .summary th:last-child,.summary td:last-child { text-align:right; }
    .summary th { background:#f4f8f9; color:#627d98; font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
    .summary .total td { border-bottom:0; font-size:16px; font-weight:900; color:#163247; background:#f7fbfa; }
    .section { margin-top:22px; }
    .section h2,.terms h2 { margin:0 0 10px; font-size:18px; color:#163247; }
    .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px 22px; padding:16px; background:#f7fafb; border:1px solid #dfe7ec; border-radius:12px; }
    .detail-row { display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid #e4eaee; padding:7px 0; font-size:12px; }
    .detail-row span { color:#627d98; }
    .detail-row strong { text-align:right; overflow-wrap:anywhere; }
    .terms { margin-top:28px; padding-top:22px; border-top:1px solid #dfe7ec; }
    .section-kicker { color:#0f766e; font-size:11px; font-weight:900; letter-spacing:.08em; }
    .terms ol { margin:12px 0 0; padding-left:22px; color:#334e68; }
    .terms li { margin:0 0 9px; font-size:12px; line-height:1.55; }
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
    @media (max-width:700px) { .inner { padding:28px 22px 30px; } .masthead { flex-direction:column; } .doc-title { text-align:left; } .meta-grid,.detail-grid { grid-template-columns:1fr; } }
    @media print { body { background:#fff; } .sheet { margin:0; max-width:none; border:0; box-shadow:none; } .button { display:none; } }
  </style>`;
}

function arrangementPanel(selection: any) {
  const route = selection.permit_submission_route ? permitSubmissionLabel(selection.permit_submission_route) : 'Permit route not recorded on this legacy acknowledgement';
  const permitType = selection.permit_type ? permitTypeLabel(selection.permit_type) : 'To be confirmed by BIMED';
  return `<section class="section"><h2>Arrangement & permit route</h2><div class="detail-grid">
    <div class="detail-row"><span>Accommodation</span><strong>${e(accommodationPlanLabel(selection.accommodation_plan))}</strong></div>
    <div class="detail-row"><span>Accommodation period</span><strong>${e(selection.accommodation_period_months)} month${Number(selection.accommodation_period_months) === 1 ? '' : 's'}</strong></div>
    <div class="detail-row"><span>Refund trigger</span><strong>${e(selection.accommodation_refund_trigger === 'one_month_accommodation_expiry' ? 'One-month accommodation expiry' : 'Successful three-month probation')}</strong></div>
    <div class="detail-row"><span>Permit type</span><strong>${e(permitType)}</strong></div>
    <div class="detail-row"><span>Permit submission</span><strong>${e(route)}</strong></div>
    <div class="detail-row"><span>Permit fee</span><strong>€${Number(selection.permit_fee_eur || 1000).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</strong></div>
    <div class="detail-row"><span>Planned initial duration</span><strong>${e(selection.permit_duration_months || 24)} months</strong></div>
    <div class="detail-row"><span>Flights & airport pickup</span><strong>Available under both accommodation plans</strong></div>
  </div></section>`;
}

export function invoiceHtml(input: { invoice: any; staff: any; publicUrl?: string }) {
  const selection = selectionForInvoice(input.invoice);
  const publicUrl = input.publicUrl || `${appUrl()}/invoices/accommodation/${input.invoice.public_token}`;
  const snapshot = input.invoice.payment_account_snapshot || {};
  const account = Object.keys(snapshot).length ? snapshot : ACCOMMODATION_PAYMENT_ACCOUNT;
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
  const terms = termsForSelection(selection);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(input.invoice.invoice_number)} · BIMED Healthcare</title>${documentStyles()}</head><body>
    <main class="sheet"><div class="topline"></div><div class="inner">
      <header class="masthead"><div><div class="brand">BIMED HEALTHCARE LIMITED</div><div class="company">Bimed Healthcare Limited</div><div class="tagline">Love. Care. Comfort. · Accommodation Billing</div></div><div class="doc-title"><h1>Accommodation Invoice</h1><div class="doc-label">Invoice number</div><div class="doc-number">${e(input.invoice.invoice_number)}</div><div class="doc-label">Issue date</div><div>${e(dateOnly(input.invoice.issued_at || input.invoice.issue_date))}</div><div class="doc-label">Due date</div><div>${e(input.invoice.due_date ? dateOnly(input.invoice.due_date) : 'On receipt')}</div></div></header>
      <div class="rule"></div>
      <div class="meta-grid"><div class="panel"><div class="kicker">BILLED TO</div><strong>${e(input.invoice.bill_to_name || input.staff.full_name)}</strong><p>${e(input.invoice.bill_to_email || input.staff.email || '')}</p><p>BIMED ID: ${e(input.staff.bimed_id || '')}</p></div><div class="panel"><div class="kicker">ARRANGEMENT</div><strong>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR</strong><p>${e(selection.accommodation_plan_label || accommodationPlanLabel(selection.accommodation_plan))}</p><p>${e(selection.accommodation_summary || '')}</p></div></div>
      <div class="summary"><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>${e(input.invoice.description)}</td><td>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</td></tr></tbody><tfoot><tr class="total"><td>TOTAL DUE</td><td>€${Number(input.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</td></tr></tfoot></table></div>
      ${arrangementPanel(selection)}
      <section class="section"><h2>Payment details</h2><div class="detail-grid">${accountRows.map(([label, value]) => `<div class="detail-row"><span>${e(label)}</span><strong>${e(value)}</strong></div>`).join('')}</div></section>
      <section class="terms"><div class="section-kicker">TERMS & CONDITIONS · VERSION ${e(selection.terms_version || ACCOMMODATION_OPTIONS_TERMS_VERSION)}</div><h2>Accommodation arrangement terms</h2><ol>${terms.map((term) => `<li>${e(term)}</li>`).join('')}</ol></section>
      <div class="notice"><strong>Important:</strong> This accommodation arrangement is separate from employment permit and visa decisions made by the relevant authorities. Payment does not guarantee permit approval, visa approval, entry to Ireland, right to work or continued employment.</div>
      ${signatureBlock(input.invoice.issued_at || input.invoice.issue_date, 'Authorised by')}
      <a class="button" href="${e(publicUrl)}">Open invoice online</a>
      <div class="footer">Document version: ${e(selection.terms_version || ACCOMMODATION_OPTIONS_TERMS_VERSION)} · Issued: ${e(dateTime(input.invoice.issued_at || input.invoice.issue_date))} · Retain this invoice and any payment receipt for your records.</div>
    </div></main></body></html>`;
}

export function receiptHtml(input: { receipt: any; invoice: any; staff: any; publicUrl?: string }) {
  const selection = selectionForInvoice(input.invoice);
  const publicUrl = input.publicUrl || `${appUrl()}/invoices/accommodation/${input.invoice.public_token}?receipt=1`;
  const paidAt = input.receipt.paid_at || input.invoice.paid_at || input.receipt.issued_at;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(input.receipt.receipt_number)} · BIMED Healthcare</title>${documentStyles()}</head><body>
    <main class="sheet"><div class="topline"></div><div class="inner">
      <header class="masthead"><div><div class="brand">BIMED HEALTHCARE LIMITED</div><div class="company">Bimed Healthcare Limited</div><div class="tagline">Love. Care. Comfort. · Payment Receipt</div></div><div class="doc-title"><h1>Accommodation Receipt</h1><div class="doc-label">Receipt number</div><div class="doc-number">${e(input.receipt.receipt_number)}</div><div class="doc-label">Issued</div><div>${e(dateTime(input.receipt.issued_at || input.receipt.created_at))}</div></div></header>
      <div class="rule"></div>
      <div class="meta-grid"><div class="panel"><div class="kicker">RECEIVED FROM</div><strong>${e(input.staff.full_name)}</strong><p>${e(input.staff.email || '')}</p><p>BIMED ID: ${e(input.staff.bimed_id || '')}</p></div><div class="panel"><div class="kicker">PAYMENT</div><strong>€${Number(input.receipt.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} ${e(input.receipt.currency || 'EUR')}</strong><p>Paid: ${e(dateTime(paidAt))}</p><p>Invoice: ${e(input.invoice.invoice_number)}</p></div></div>
      <div class="status-box"><div class="label">PAYMENT CONFIRMED</div><div class="amount">€${Number(input.receipt.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</div></div>
      <div class="summary"><table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>${e(input.invoice.description)}</td><td>€${Number(input.receipt.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</td></tr></tbody></table></div>
      ${arrangementPanel(selection)}
      <section class="section"><h2>Payment record</h2><div class="detail-grid"><div class="detail-row"><span>Payment reference</span><strong>${e(input.receipt.payment_reference || '—')}</strong></div><div class="detail-row"><span>Payment method</span><strong>${e(input.receipt.payment_method || '—')}</strong></div><div class="detail-row"><span>Receipt issued by</span><strong>${e(input.receipt.issued_by || `${ACCOMMODATION_SIGNATORY_NAME} · ${ACCOMMODATION_SIGNATORY_TITLE}`)}</strong></div><div class="detail-row"><span>Accommodation plan</span><strong>${e(accommodationPlanLabel(selection.accommodation_plan))}</strong></div></div></section>
      <div class="notice"><strong>Important:</strong> This receipt confirms the recorded payment of the accommodation invoice. It is not a permit, visa or right-to-work approval.</div>
      ${signatureBlock(input.receipt.issued_at || input.receipt.created_at, 'Receipt authorised by')}
      <a class="button" href="${e(publicUrl)}">Open receipt online</a>
      <div class="footer">Document version: ${e(selection.terms_version || ACCOMMODATION_OPTIONS_TERMS_VERSION)} · Paid: ${e(dateTime(paidAt))} · Retain this receipt with the original invoice.</div>
    </div></main></body></html>`;
}

export { appUrl };
