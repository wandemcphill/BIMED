import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { appUrl, sendAccommodationEmail } from '@/lib/accommodation-billing';

type Params = { params: Promise<{ token: string }> };

async function getContext(token: string) {
  const client = db();
  const { data: invoice } = await client
    .from('recruitment_accommodation_invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (!invoice || invoice.status === 'cancelled') return null;

  const { data: permit } = await client
    .from('recruitment_staff_permit_cases')
    .select('*')
    .eq('id', invoice.permit_case_id)
    .maybeSingle();
  if (!permit) return null;

  const { data: staff } = await client
    .from('recruitment_staff')
    .select('id,full_name,bimed_id,email,application_id')
    .eq('id', permit.staff_id)
    .maybeSingle();
  if (!staff) return null;

  const { data: application } = staff.application_id
    ? await client.from('recruitment_applications').select('email,full_name').eq('id', staff.application_id).maybeSingle()
    : { data: null };

  return { client, invoice, permit, staff, application };
}

function safeRateHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const context = await getContext(token);
  if (!context) return safeRateHeaders(NextResponse.json({ error: 'Invoice not found.' }, { status: 404 }));

  const body = await request.json().catch(() => null) as { action?: string; reason?: string } | null;
  const action = body?.action;

  if (!['payment_reported', 'cancellation_requested'].includes(String(action))) {
    return safeRateHeaders(NextResponse.json({ error: 'Unsupported invoice action.' }, { status: 400 }));
  }

  const { client, invoice, permit, staff, application } = context;

  if (invoice.status === 'paid') {
    return safeRateHeaders(NextResponse.json({ error: 'This invoice has already been recorded as paid.', code: 'already_paid' }, { status: 409 }));
  }

  if (invoice.status === 'cancelled') {
    return safeRateHeaders(NextResponse.json({ error: 'This invoice has already been cancelled.', code: 'already_cancelled' }, { status: 409 }));
  }

  const now = new Date().toISOString();
  const candidateEmail = application?.email || staff.email;

  if (action === 'payment_reported') {
    if (!['issued', 'payment_reported'].includes(invoice.status)) {
      return safeRateHeaders(NextResponse.json({ error: 'Payment can only be reported against an issued invoice.', code: 'payment_not_allowed' }, { status: 409 }));
    }

    const { data: updated, error } = await client
      .from('recruitment_accommodation_invoices')
      .update({
        status: 'payment_reported',
        payment_reported_at: invoice.payment_reported_at || now,
        payment_reported_by: 'candidate',
        updated_at: now,
      })
      .eq('id', invoice.id)
      .in('status', ['issued', 'payment_reported'])
      .select('*')
      .single();

    if (error || !updated) return safeRateHeaders(NextResponse.json({ error: 'Unable to record your payment notice.' }, { status: 500 }));

    const subject = `Payment receipt required: BIMED accommodation invoice ${updated.invoice_number}`;
    const html = `<div style="font-family:Arial,sans-serif;color:#172b4d">
      <h2>Accommodation payment reported</h2>
      <p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has reported payment of <strong>€${Number(updated.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</strong> against invoice <strong>${updated.invoice_number}</strong>.</p>
      <p>Please request/confirm the payment receipt and verify the transfer before marking this invoice as <strong>paid</strong>.</p>
      <p>Candidate email: ${candidateEmail || 'not available'}</p>
      <p><a href="${appUrl()}/admin/billing">Open the accommodation invoice queue</a></p>
    </div>`;

    try {
      await sendAccommodationEmail({ to: ['overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'], subject, html });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'payment_reported_admin_email_failed', invoice_id: updated.id, reason: error instanceof Error ? error.message : String(error) }));
    }

    await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'payment_reported', updated_at: now }).eq('id', permit.id);

    await createStaffNotification(client, {
      staffId: staff.id,
      category: 'billing',
      title: 'Payment notice received',
      body: `Your payment notice for invoice ${updated.invoice_number} has been recorded. Please send your payment receipt to overseas@bimedhealthcare.com for verification.`,
      actionUrl: `/invoices/accommodation/${updated.public_token}`,
    });

    await createStaffAudit(client, {
      staffId: staff.id,
      actor: 'candidate',
      eventType: 'accommodation_payment_reported',
      metadata: { invoice_id: updated.id, invoice_number: updated.invoice_number, amount_eur: updated.amount_eur },
    });

    return safeRateHeaders(NextResponse.json({
      ok: true,
      status: updated.status,
      receiptEmail: 'overseas@bimedhealthcare.com',
      mailto: `mailto:overseas@bimedhealthcare.com?subject=${encodeURIComponent(`Payment receipt - ${updated.invoice_number}`)}&body=${encodeURIComponent(`Please find attached my payment receipt for BIMED accommodation invoice ${updated.invoice_number}.`) }`,
    }));
  }

  if (!['issued', 'payment_reported', 'cancellation_requested'].includes(invoice.status)) {
    return safeRateHeaders(NextResponse.json({ error: 'This invoice cannot be cancelled in its current state.', code: 'cancellation_not_allowed' }, { status: 409 }));
  }

  const reason = String(body?.reason || '').trim() || 'Candidate requested invoice cancellation.';

  const { data: updated, error } = await client
    .from('recruitment_accommodation_invoices')
    .update({
      status: 'cancellation_requested',
      cancellation_requested_at: invoice.cancellation_requested_at || now,
      cancellation_requested_by: 'candidate',
      cancellation_reason: reason,
      updated_at: now,
    })
    .eq('id', invoice.id)
    .in('status', ['issued', 'payment_reported', 'cancellation_requested'])
    .select('*')
    .single();

  if (error || !updated) return safeRateHeaders(NextResponse.json({ error: 'Unable to record the cancellation request.' }, { status: 500 }));

  const subject = `Accommodation invoice cancellation requested: ${updated.invoice_number}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#172b4d">
    <h2>Accommodation invoice cancellation requested</h2>
    <p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has requested cancellation of invoice <strong>${updated.invoice_number}</strong>.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p><a href="${appUrl()}/admin/billing">Open the accommodation invoice queue</a></p>
  </div>`;

  try {
    await sendAccommodationEmail({ to: ['overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'], subject, html });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'invoice_cancellation_admin_email_failed', invoice_id: updated.id, reason: error instanceof Error ? error.message : String(error) }));
  }

  await client.from('recruitment_staff_permit_cases').update({ accommodation_payment_status: 'cancellation_requested', updated_at: now }).eq('id', permit.id);

  await createStaffNotification(client, {
    staffId: staff.id,
    category: 'billing',
    title: 'Invoice cancellation request received',
    body: `BIMED has received your cancellation request for invoice ${updated.invoice_number}. The billing team will review it.`,
    actionUrl: '/staff/permit',
  });

  await createStaffAudit(client, {
    staffId: staff.id,
    actor: 'candidate',
    eventType: 'accommodation_invoice_cancellation_requested',
    metadata: { invoice_id: updated.id, invoice_number: updated.invoice_number, reason },
  });

  return safeRateHeaders(NextResponse.json({ ok: true, status: updated.status }));
}
