import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit } from '@/lib/staff';
import { ACCOMMODATION_SIGNATORY_NAME, ACCOMMODATION_SIGNATORY_TITLE, appUrl, makeReceiptNumber, sendAccommodationEmail } from '@/lib/accommodation-billing';
import { invoiceHtml, receiptHtml } from '@/lib/accommodation-documents';
import { recordAccommodationPaymentAtomic } from '@/lib/staff-portal-workflow';
import { issueAccommodationInvoice } from '@/lib/accommodation-invoice-service';
function safePublicUrl(token: string) { return `${appUrl()}/invoices/accommodation/${token}`; }
async function issueReceiptForPaidInvoice(client: ReturnType<typeof db>, invoice: any, staff: any, application: any, permit: any) {
  const { data: existingReceipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle(); if (existingReceipt) return { receipt: existingReceipt, publicUrl: `${safePublicUrl(invoice.public_token)}?receipt=1`, created: false };
  const receiptIssuedAt = new Date().toISOString(); const { data: receipt, error } = await client.from('recruitment_accommodation_receipts').insert({ invoice_id: invoice.id, receipt_number: makeReceiptNumber(new Date(receiptIssuedAt)), amount_eur: invoice.amount_eur, currency: invoice.currency, paid_at: invoice.paid_at || receiptIssuedAt, payment_reference: invoice.payment_reference, payment_method: invoice.payment_method, issued_by: `${ACCOMMODATION_SIGNATORY_NAME} · ${ACCOMMODATION_SIGNATORY_TITLE}`, notes: `Automatically issued upon payment confirmation. Authorised by ${ACCOMMODATION_SIGNATORY_NAME}.` }).select('*').single();
  if (error || !receipt) throw new Error('Unable to create the professional receipt.'); await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'paid_receipted', updated_at: receiptIssuedAt }).eq('id', permit.id); const publicUrl = `${safePublicUrl(invoice.public_token)}?receipt=1`;
  try { await sendAccommodationEmail({ to: [application?.email || staff.email], subject: `BIMED payment receipt ${receipt.receipt_number}`, html: receiptHtml({ receipt, invoice, staff, publicUrl }) }); } catch (emailError) { console.error(JSON.stringify({ level: 'error', event: 'accommodation_receipt_email_failed', receipt_id: receipt.id, reason: emailError instanceof Error ? emailError.message : String(emailError) })); }
  await createStaffAudit(client, { staffId: staff.id, actor: ACCOMMODATION_SIGNATORY_NAME, eventType: 'accommodation_payment_receipt_issued', metadata: { receipt_number: receipt.receipt_number, invoice_number: invoice.invoice_number, issued_by: ACCOMMODATION_SIGNATORY_NAME } }); return { receipt, publicUrl, created: true };
}
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request); if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 }); const { id } = await context.params; const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,email,job_title,role,application_id').eq('id', id).maybeSingle(); if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle(); if (!permit) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });
  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('permit_case_id', permit.id).maybeSingle(); const { data: receipt } = invoice ? await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle() : { data: null }; const { data: account } = await client.from('recruitment_payment_accounts').select('*').eq('is_active', true).maybeSingle();
  return NextResponse.json({ staff, permit, invoice, receipt, account });
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request); if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 }); const { id } = await context.params; const body = await request.json().catch(() => null) as any; const action = typeof body?.action === 'string' ? body.action : ''; const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,email,application_id').eq('id', id).maybeSingle(); if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 }); const { data: permit } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle(); if (!permit) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 }); const application = staff.application_id ? (await client.from('recruitment_applications').select('email,full_name').eq('id', staff.application_id).maybeSingle()).data : null; const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('permit_case_id', permit.id).maybeSingle();
  if (action === 'save_account') {
    const required = ['account_name', 'bank_name']; if (required.some((key) => !String(body?.[key] || '').trim())) return NextResponse.json({ error: 'Account name and bank name are required.' }, { status: 400 });
    await client.from('recruitment_payment_accounts').update({ is_active: false, updated_at: new Date().toISOString() }).eq('is_active', true); const { data: account, error } = await client.from('recruitment_payment_accounts').insert({ account_name: String(body.account_name).trim(), bank_name: String(body.bank_name).trim(), iban: String(body.iban || '').trim() || null, bic_swift: String(body.bic_swift || '').trim() || null, account_number: String(body.account_number || '').trim() || null, sort_code: String(body.sort_code || '').trim() || null, branch_details: String(body.branch_details || '').trim() || null, payment_reference_instructions: String(body.payment_reference_instructions || '').trim() || null, currency: 'EUR', is_active: true }).select('*').single(); if (error || !account) return NextResponse.json({ error: 'Unable to save the payment account.' }, { status: 500 }); await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_payment_account_updated', metadata: { bank_name: account.bank_name, account_currency: account.currency } }); return NextResponse.json({ account });
  }
  if (action === 'save_invoice_draft') {
    if (!invoice) return NextResponse.json({ error: 'No accommodation invoice request exists yet.' }, { status: 404 }); if (invoice.status !== 'draft') return NextResponse.json({ error: 'Only draft invoices can be edited.' }, { status: 409 });
    const billToName = String(body?.bill_to_name || '').trim() || staff.full_name; const billToEmail = String(body?.bill_to_email || '').trim() || application?.email || staff.email; const description = String(body?.description || '').trim() || invoice.description; const notes = String(body?.notes || '').trim() || null; const dueDate = String(body?.due_date || '').trim() || invoice.due_date;
    const { data: updated, error } = await client.from('recruitment_accommodation_invoices').update({ bill_to_name: billToName, bill_to_email: billToEmail, description, notes, admin_bill_to_name: billToName, admin_bill_to_email: billToEmail, admin_description: description, admin_notes: notes, due_date: dueDate, updated_at: new Date().toISOString() }).eq('id', invoice.id).select('*').single(); if (error || !updated) return NextResponse.json({ error: 'Unable to save the invoice draft.' }, { status: 500 }); await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_invoice_draft_updated', metadata: { invoice_number: updated.invoice_number } }); return NextResponse.json({ invoice: updated });
  }
  if (action === 'issue_invoice') {
    if (!invoice) return NextResponse.json({ error: 'The candidate has not acknowledged the accommodation arrangement yet.' }, { status: 409 });
    try {
      const result = await issueAccommodationInvoice({
        client,
        invoice,
        staff,
        application,
        permit,
        actor: session.email,
        automatic: false,
      });
      return NextResponse.json({ invoice: result.invoice, publicUrl: result.publicUrl });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to issue the invoice.' }, { status: 500 });
    }
  }
  if (action === 'send_invoice') {
    if (!invoice || !['issued', 'payment_reported', 'cancellation_requested', 'paid'].includes(invoice.status)) return NextResponse.json({ error: 'Only an issued invoice can be sent.' }, { status: 409 }); const to = String(body?.email || '').trim(); if (!to || !to.includes('@')) return NextResponse.json({ error: 'Provide a valid recipient email address.' }, { status: 400 }); const publicUrl = safePublicUrl(invoice.public_token); try { await sendAccommodationEmail({ to, subject: `BIMED accommodation invoice ${invoice.invoice_number}`, html: invoiceHtml({ invoice, staff, publicUrl }) }); } catch (emailError) { return NextResponse.json({ error: emailError instanceof Error ? emailError.message : 'Unable to send the invoice.' }, { status: 502 }); } await client.from('recruitment_accommodation_invoices').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id); await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_invoice_sent', metadata: { invoice_number: invoice.invoice_number, recipient: to } }); return NextResponse.json({ ok: true });
  }
  if (action === 'mark_paid') {
    if (!invoice) return NextResponse.json({ error: 'No payable invoice is available.' }, { status: 409 }); if (!['issued', 'payment_reported'].includes(invoice.status)) return NextResponse.json({ error: 'Only an issued or payment-reported invoice can be recorded as paid.' }, { status: 409 });
    const paymentReference = String(body?.payment_reference || '').trim() || null; const paymentMethod = String(body?.payment_method || 'Bank transfer').trim() || 'Bank transfer';
    try {
      const atomic = await recordAccommodationPaymentAtomic(client, { invoiceId: invoice.id, paymentReference, paymentMethod, actor: session.email, receiptIssuedBy: `${ACCOMMODATION_SIGNATORY_NAME} · ${ACCOMMODATION_SIGNATORY_TITLE}` });
      const { data: paidInvoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('id', invoice.id).single();
      const { data: receipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('id', atomic.receipt_id).single();
      if (!paidInvoice || !receipt) return NextResponse.json({ error: 'Payment was committed but its resulting records could not be reloaded.' }, { status: 500 });
      const publicUrl = `${safePublicUrl(paidInvoice.public_token)}?receipt=1`;
      try { await sendAccommodationEmail({ to: [application?.email || staff.email], subject: `BIMED payment receipt ${receipt.receipt_number}`, html: receiptHtml({ receipt, invoice: paidInvoice, staff, publicUrl }) }); } catch (emailError) { console.error(JSON.stringify({ level: 'error', event: 'accommodation_receipt_email_failed', receipt_id: receipt.id, reason: emailError instanceof Error ? emailError.message : String(emailError) })); }
      return NextResponse.json({ invoice: paidInvoice, receipt, receiptPublicUrl: publicUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to record the payment.';
      if (message.includes('ACCOMMODATION_INVOICE_NOT_PAYABLE')) return NextResponse.json({ error: 'This invoice is no longer payable. Refresh the billing record before retrying.' }, { status: 409 });
      if (message.includes('ACCOMMODATION_RECEIPT_ALREADY_EXISTS')) return NextResponse.json({ error: 'A receipt already exists for this invoice. Refresh the billing record instead of recording the payment again.' }, { status: 409 });
      return NextResponse.json({ error: 'Unable to atomically complete the payment and receipt workflow.' }, { status: 500 });
    }
  }
  if (action === 'cancel_invoice') {
    if (!invoice) return NextResponse.json({ error: 'No accommodation invoice exists yet.' }, { status: 404 });
    if (!['issued', 'payment_reported', 'cancellation_requested'].includes(invoice.status)) return NextResponse.json({ error: 'Only an active invoice can be cancelled.' }, { status: 409 });
    const now = new Date().toISOString();
    const { data: cancelled, error: cancelError } = await client
      .from('recruitment_accommodation_invoices')
      .update({ status: 'cancelled', admin_action_at: now, admin_action_by: session.email, updated_at: now })
      .eq('id', invoice.id)
      .in('status', ['issued', 'payment_reported', 'cancellation_requested'])
      .select('*')
      .single();
    if (cancelError || !cancelled) return NextResponse.json({ error: 'Unable to cancel the invoice.' }, { status: 500 });
    await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'cancelled', updated_at: now }).eq('id', permit.id);
    await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation invoice cancelled', body: `BIMED has cancelled accommodation invoice ${cancelled.invoice_number}.`, actionUrl: '/staff/permit' });
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_invoice_cancelled', metadata: { invoice_number: cancelled.invoice_number } });
    return NextResponse.json({ invoice: cancelled });
  }

  if (action === 'issue_receipt') { if (!invoice || invoice.status !== 'paid') return NextResponse.json({ error: 'Record payment before issuing a receipt.' }, { status: 409 }); const receiptResult = await issueReceiptForPaidInvoice(client, invoice, staff, application, permit); return NextResponse.json({ receipt: receiptResult.receipt, publicUrl: receiptResult.publicUrl }); }
  return NextResponse.json({ error: 'Unsupported billing action.' }, { status: 400 });
}
