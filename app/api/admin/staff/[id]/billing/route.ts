import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit } from '@/lib/staff';
import {
  ACCOMMODATION_AMOUNT_EUR,
  ACCOMMODATION_REFUND_INSTALLMENTS,
  appUrl,
  makeReceiptNumber,
  receiptHtml,
  invoiceHtml,
  sendAccommodationEmail,
} from '@/lib/accommodation-billing';

function safePublicUrl(token: string) {
  return `${appUrl()}/invoices/accommodation/${token}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,email,job_title,role,application_id').eq('id', id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle();
  if (!permit) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });
  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('permit_case_id', permit.id).maybeSingle();
  const { data: receipt } = invoice ? await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle() : { data: null };
  const { data: account } = await client.from('recruitment_payment_accounts').select('*').eq('is_active', true).maybeSingle();
  return NextResponse.json({ staff, permit, invoice, receipt, account });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const action = typeof body?.action === 'string' ? body.action : '';
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,email,application_id').eq('id', id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle();
  if (!permit) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });
  const application = staff.application_id ? (await client.from('recruitment_applications').select('email,full_name').eq('id', staff.application_id).maybeSingle()).data : null;

  if (action === 'save_account') {
    const required = ['account_name','bank_name'];
    if (required.some((key) => !String(body?.[key] || '').trim())) return NextResponse.json({ error: 'Account name and bank name are required.' }, { status: 400 });
    await client.from('recruitment_payment_accounts').update({ is_active: false, updated_at: new Date().toISOString() }).eq('is_active', true);
    const { data: account, error } = await client.from('recruitment_payment_accounts').insert({
      account_name: String(body.account_name).trim(),
      bank_name: String(body.bank_name).trim(),
      iban: String(body.iban || '').trim() || null,
      bic_swift: String(body.bic_swift || '').trim() || null,
      account_number: String(body.account_number || '').trim() || null,
      sort_code: String(body.sort_code || '').trim() || null,
      branch_details: String(body.branch_details || '').trim() || null,
      payment_reference_instructions: String(body.payment_reference_instructions || '').trim() || null,
      currency: 'EUR',
      is_active: true,
    }).select('*').single();
    if (error || !account) return NextResponse.json({ error: 'Unable to save the payment account.' }, { status: 500 });
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_payment_account_updated', metadata: { bank_name: account.bank_name, account_currency: account.currency } });
    return NextResponse.json({ account });
  }

  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('permit_case_id', permit.id).maybeSingle();

  if (action === 'issue_invoice') {
    if (!invoice) return NextResponse.json({ error: 'The candidate has not acknowledged the accommodation arrangement yet.' }, { status: 409 });
    const { data: account } = await client.from('recruitment_payment_accounts').select('*').eq('is_active', true).maybeSingle();
    if (!account) return NextResponse.json({ error: 'Add and save the active payment account details before issuing the invoice.' }, { status: 409 });
    const now = new Date().toISOString();
    const snapshot = {
      account_name: account.account_name,
      bank_name: account.bank_name,
      iban: account.iban,
      bic_swift: account.bic_swift,
      account_number: account.account_number,
      sort_code: account.sort_code,
      branch_details: account.branch_details,
      payment_reference_instructions: account.payment_reference_instructions,
      currency: account.currency,
    };
    const { data: updatedInvoice, error } = await client.from('recruitment_accommodation_invoices').update({
      status: 'issued',
      issued_at: invoice.issued_at || now,
      payment_account_snapshot: snapshot,
      updated_at: now,
    }).eq('id', invoice.id).select('*').single();
    if (error || !updatedInvoice) return NextResponse.json({ error: 'Unable to issue the invoice.' }, { status: 500 });
    await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'invoice_issued', updated_at: now }).eq('id', permit.id);
    const publicUrl = safePublicUrl(updatedInvoice.public_token);
    try {
      await sendAccommodationEmail({
        to: [application?.email || staff.email, 'overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'],
        subject: `BIMED accommodation invoice ${updatedInvoice.invoice_number}`,
        html: invoiceHtml({ invoice: updatedInvoice, staff, publicUrl }),
      });
      await client.from('recruitment_accommodation_invoices').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id);
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_invoice_email_failed', invoice_id: invoice.id, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
    }
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_invoice_issued', metadata: { invoice_number: updatedInvoice.invoice_number, amount_eur: updatedInvoice.amount_eur } });
    return NextResponse.json({ invoice: updatedInvoice, publicUrl });
  }

  if (action === 'send_invoice') {
    if (!invoice || !['issued','paid'].includes(invoice.status)) return NextResponse.json({ error: 'Only an issued invoice can be sent.' }, { status: 409 });
    const to = String(body?.email || '').trim();
    if (!to || !to.includes('@')) return NextResponse.json({ error: 'Provide a valid recipient email address.' }, { status: 400 });
    const publicUrl = safePublicUrl(invoice.public_token);
    try {
      await sendAccommodationEmail({ to, subject: `BIMED accommodation invoice ${invoice.invoice_number}`, html: invoiceHtml({ invoice, staff, publicUrl }) });
    } catch (emailError) {
      return NextResponse.json({ error: emailError instanceof Error ? emailError.message : 'Unable to send the invoice.' }, { status: 502 });
    }
    await client.from('recruitment_accommodation_invoices').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id);
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_invoice_sent', metadata: { invoice_number: invoice.invoice_number, recipient: to } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'mark_paid') {
    if (!invoice || invoice.status === 'cancelled') return NextResponse.json({ error: 'No payable invoice is available.' }, { status: 409 });
    if (invoice.status === 'paid') return NextResponse.json({ error: 'This invoice is already recorded as paid.' }, { status: 409 });
    const paidAt = String(body?.paid_at || new Date().toISOString());
    const paymentReference = String(body?.payment_reference || '').trim() || null;
    const paymentMethod = String(body?.payment_method || 'Bank transfer').trim() || 'Bank transfer';
    const { data: paidInvoice, error } = await client.from('recruitment_accommodation_invoices').update({ status: 'paid', paid_at: paidAt, payment_reference: paymentReference, payment_method: paymentMethod, updated_at: new Date().toISOString() }).eq('id', invoice.id).select('*').single();
    if (error || !paidInvoice) return NextResponse.json({ error: 'Unable to record the payment.' }, { status: 500 });
    await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'paid', accommodation_paid_at: paidAt, updated_at: new Date().toISOString() }).eq('id', permit.id);
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_payment_recorded', metadata: { invoice_number: invoice.invoice_number, payment_reference: paymentReference, payment_method: paymentMethod } });
    return NextResponse.json({ invoice: paidInvoice });
  }

  if (action === 'issue_receipt') {
    if (!invoice || invoice.status !== 'paid') return NextResponse.json({ error: 'Record payment before issuing a receipt.' }, { status: 409 });
    const { data: existingReceipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle();
    if (existingReceipt) return NextResponse.json({ receipt: existingReceipt, publicUrl: `${safePublicUrl(invoice.public_token)}?receipt=1` });
    const { data: receipt, error } = await client.from('recruitment_accommodation_receipts').insert({
      invoice_id: invoice.id,
      receipt_number: makeReceiptNumber(),
      amount_eur: invoice.amount_eur,
      currency: invoice.currency,
      paid_at: invoice.paid_at || new Date().toISOString(),
      payment_reference: invoice.payment_reference,
      payment_method: invoice.payment_method,
      issued_by: session.email,
      notes: String(body?.notes || '').trim() || null,
    }).select('*').single();
    if (error || !receipt) return NextResponse.json({ error: 'Unable to issue the receipt.' }, { status: 500 });
    await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'paid_receipted', updated_at: new Date().toISOString() }).eq('id', permit.id);
    const publicUrl = `${safePublicUrl(invoice.public_token)}?receipt=1`;
    try {
      await sendAccommodationEmail({ to: [application?.email || staff.email], subject: `BIMED payment receipt ${receipt.receipt_number}`, html: receiptHtml({ receipt, invoice, staff, publicUrl }) });
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_receipt_email_failed', receipt_id: receipt.id, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
    }
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_payment_receipt_issued', metadata: { receipt_number: receipt.receipt_number, invoice_number: invoice.invoice_number } });
    return NextResponse.json({ receipt, publicUrl });
  }

  return NextResponse.json({ error: 'Unsupported billing action.' }, { status: 400 });
}
