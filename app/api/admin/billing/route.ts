import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { cancelAccommodationInvoice, issueAccommodationInvoice } from '@/lib/accommodation-invoice-service';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { appUrl, makeReceiptNumber, sendAccommodationEmail, ACCOMMODATION_SIGNATORY_NAME, ACCOMMODATION_SIGNATORY_TITLE } from '@/lib/accommodation-billing';
import { receiptHtml } from '@/lib/accommodation-documents';
import { recordAccommodationPaymentAtomic } from '@/lib/staff-portal-workflow';

async function loadInvoiceContext(client: ReturnType<typeof db>, invoiceId: string) {
  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!invoice) return null;
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', invoice.permit_case_id).maybeSingle();
  if (!permit) return null;
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,bimed_id,email,application_id').eq('id', permit.staff_id).maybeSingle();
  if (!staff) return null;
  const application = staff.application_id
    ? (await client.from('recruitment_applications').select('email,full_name').eq('id', staff.application_id).maybeSingle()).data
    : null;
  return { invoice, permit, staff, application };
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const { data: invoices, error } = await client
    .from('recruitment_accommodation_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ error: 'Unable to load accommodation invoice queue.' }, { status: 500 });

  const rows = [];
  for (const invoice of invoices || []) {
    const context = await loadInvoiceContext(client, invoice.id);
    if (!context) continue;
    rows.push({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      amount_eur: invoice.amount_eur,
      currency: invoice.currency,
      bill_to_name: invoice.bill_to_name || context.staff.full_name,
      bill_to_email: invoice.bill_to_email || context.application?.email || context.staff.email,
      created_at: invoice.created_at,
      issued_at: invoice.issued_at,
      payment_reported_at: invoice.payment_reported_at,
      cancellation_requested_at: invoice.cancellation_requested_at,
      cancellation_reason: invoice.cancellation_reason,
      public_token: invoice.public_token,
      staff: {
        id: context.staff.id,
        full_name: context.staff.full_name,
        bimed_id: context.staff.bimed_id,
        email: context.staff.email,
      },
    });
  }

  return NextResponse.json({ rows, counts: rows.reduce((acc: Record<string, number>, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {}) });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json().catch(() => null) as any;
  const action = String(body?.action || '');
  const invoiceId = String(body?.invoiceId || '');
  if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required.' }, { status: 400 });

  const client = db();
  const context = await loadInvoiceContext(client, invoiceId);
  if (!context) return NextResponse.json({ error: 'Accommodation invoice not found.' }, { status: 404 });

  const { invoice, permit, staff, application } = context;

  if (action === 'issue_invoice') {
    if (!['draft'].includes(invoice.status)) return NextResponse.json({ error: `Only draft invoices can be issued. Current status: ${invoice.status}.` }, { status: 409 });
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
      return NextResponse.json({ ok: true, invoice: result.invoice, publicUrl: result.publicUrl });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to issue invoice.' }, { status: 500 });
    }
  }

  if (action === 'mark_paid') {
    if (!['issued', 'payment_reported'].includes(invoice.status)) return NextResponse.json({ error: 'Only issued or payment-reported invoices can be marked paid.' }, { status: 409 });
    try {
      const atomic = await recordAccommodationPaymentAtomic(client, {
        invoiceId: invoice.id,
        paymentReference: String(body?.payment_reference || '').trim() || null,
        paymentMethod: String(body?.payment_method || 'Bank transfer').trim() || 'Bank transfer',
        actor: session.email,
        receiptIssuedBy: `${ACCOMMODATION_SIGNATORY_NAME} · ${ACCOMMODATION_SIGNATORY_TITLE}`,
      });
      const { data: paidInvoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('id', invoice.id).single();
      const { data: receipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('id', atomic.receipt_id).single();
      if (!paidInvoice || !receipt) return NextResponse.json({ error: 'Payment was recorded but the receipt could not be reloaded.' }, { status: 500 });
      const publicUrl = `${appUrl()}/invoices/accommodation/${paidInvoice.public_token}?receipt=1`;
      try {
        await sendAccommodationEmail({
          to: [application?.email || staff.email],
          subject: `BIMED payment receipt ${receipt.receipt_number}`,
          html: receiptHtml({ receipt, invoice: paidInvoice, staff, publicUrl }),
        });
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'billing_queue_receipt_email_failed', invoice_id: invoice.id, reason: error instanceof Error ? error.message : String(error) }));
      }
      await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation payment verified', body: `BIMED has verified your payment for invoice ${paidInvoice.invoice_number} and issued a receipt.`, actionUrl: `/invoices/accommodation/${paidInvoice.public_token}?receipt=1` });
      await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_payment_verified', metadata: { invoice_number: paidInvoice.invoice_number, receipt_number: receipt.receipt_number } });
      return NextResponse.json({ ok: true, invoice: paidInvoice, receipt });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to mark invoice paid.' }, { status: 500 });
    }
  }

  if (action === 'cancel_invoice') {
    if (!['issued', 'payment_reported', 'cancellation_requested'].includes(invoice.status)) return NextResponse.json({ error: 'Only active invoices can be cancelled.' }, { status: 409 });
    try {
      const cancelled = await cancelAccommodationInvoice({
        client,
        invoice,
        staff,
        actor: session.email,
      });
      return NextResponse.json({ ok: true, invoice: cancelled });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel invoice.';
      const status = message.includes('ACCOMMODATION_INVOICE_NOT_CANCELABLE') ? 409 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === 'send_invoice') {
    if (!['issued', 'payment_reported', 'cancellation_requested'].includes(invoice.status)) return NextResponse.json({ error: 'Only an issued invoice can be sent.' }, { status: 409 });
    const publicUrl = `${appUrl()}/invoices/accommodation/${invoice.public_token}`;
    const recipient = String(body?.email || application?.email || staff.email).trim();
    if (!recipient || !recipient.includes('@')) return NextResponse.json({ error: 'Provide a valid recipient email address.' }, { status: 400 });
    try {
      await sendAccommodationEmail({
        to: recipient,
        subject: `BIMED accommodation invoice ${invoice.invoice_number} is ready`,
        html: `<div style="font-family:Arial,sans-serif;color:#172b4d">
          <h2>BIMED accommodation invoice ready</h2>
          <p>The invoice <strong>${invoice.invoice_number}</strong> is available in the BIMED invoice portal.</p>
          <p><a href="${publicUrl}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800">Open invoice</a></p>
          <p style="font-size:12px;color:#627d98">Payment details are shown on the portal invoice. They are not included in this email.</p>
        </div>`,
      });
      await client.from('recruitment_accommodation_invoices').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send invoice.' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Unsupported billing action.' }, { status: 400 });
}
