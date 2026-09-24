import type { SupabaseClient } from '@supabase/supabase-js';
import { appUrl, sendAccommodationEmail } from '@/lib/accommodation-billing';
import { accommodationGbpEquivalent } from '@/lib/employment-permit-options';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

type InvoiceStaff = {
  id: string;
  full_name: string;
  bimed_id: string;
  email: string;
};

type InvoiceApplication = {
  email?: string | null;
};

type InvoicePermit = {
  id: string;
  accommodation_payment_status?: string | null;
};

export async function issueAccommodationInvoice(input: {
  client: SupabaseClient;
  invoice: any;
  staff: InvoiceStaff;
  application?: InvoiceApplication | null;
  permit: InvoicePermit;
  actor: string;
  automatic?: boolean;
}) {
  const { client, invoice, staff, application, permit, actor, automatic = false } = input;

  if (!invoice) throw new Error('ACCOMMODATION_INVOICE_NOT_FOUND');
  if (!['draft', 'issued'].includes(invoice.status)) {
    throw new Error(`ACCOMMODATION_INVOICE_NOT_ISSUABLE:${invoice.status}`);
  }

  if (invoice.status === 'issued') {
    return {
      invoice,
      publicUrl: `${appUrl()}/invoices/accommodation/${invoice.public_token}`,
      alreadyIssued: true,
    };
  }

  const dueDate = invoice.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: atomicResult, error: invoiceError } = await client.rpc('bimed_issue_accommodation_invoice', {
    p_invoice_id: invoice.id,
    p_actor: actor,
    p_due_date: dueDate,
    p_payment_account_snapshot: null,
  });

  if (invoiceError || !atomicResult?.invoice) {
    throw new Error(invoiceError?.message || 'ACCOMMODATION_INVOICE_ISSUE_FAILED');
  }

  const updatedInvoice = atomicResult.invoice;
  if (atomicResult.already_issued) {
    return {
      invoice: updatedInvoice,
      publicUrl: `${appUrl()}/invoices/accommodation/${updatedInvoice.public_token}`,
      alreadyIssued: true,
    };
  }

  const publicUrl = `${appUrl()}/invoices/accommodation/${updatedInvoice.public_token}`;
  const recipients = ['info@bimedhealthcare.com', 'manager@bimedhealthcare.com'];
  const shared = updatedInvoice.arrangement_snapshot?.shared === true;
  const otherCandidateName = updatedInvoice.arrangement_snapshot?.share_role === 'partner'
    ? updatedInvoice.arrangement_snapshot?.primary_name
    : updatedInvoice.arrangement_snapshot?.partner_name;
  const sharedReference = updatedInvoice.arrangement_snapshot?.share_reference;
  const totalArrangement = Number(updatedInvoice.arrangement_snapshot?.total_amount_eur || updatedInvoice.amount_eur * (shared ? 2 : 1));

  let emailSent = true;
  try {
    await sendAccommodationEmail({
      to: recipients,
      subject: shared ? `BIMED shared accommodation invoice ${updatedInvoice.invoice_number} is ready` : `BIMED accommodation invoice ${updatedInvoice.invoice_number} is ready`,
      html: `<div style="font-family:Arial,sans-serif;color:#172b4d">
        <h2>${shared ? 'Your BIMED shared accommodation invoice is ready' : 'Your BIMED accommodation invoice is ready'}</h2>
        <p>Hello BIMED Team,</p>
        <p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has an accommodation invoice <strong>${updatedInvoice.invoice_number}</strong> for <strong>€${Number(updatedInvoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR</strong>.</p><p>${shared ? `The shared accommodation arrangement is linked to <strong>${otherCandidateName || 'another BIMED candidate'}</strong>. Shared arrangement reference: <strong>${sharedReference || '—'}</strong>. Total accommodation arrangement: <strong>€${totalArrangement.toLocaleString('en-IE', { minimumFractionDigits: 2 })}</strong>; the invoice represents the candidate's <strong>50% share</strong>.` : 'The invoice reflects the accommodation and permit selections recorded in the Staff Portal.'}</p>
        <p>Please open the invoice in the BIMED Staff Portal to review the accommodation selection, your share, amount due, and terms.</p>
        <p><a href="${publicUrl}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800">Open accommodation invoice</a></p>
        <p style="font-size:12px;color:#627d98">Payment account details are not included on the invoice. When you are ready to proceed with payment, email manager@bimedhealthcare.com directly to request the current payment details and instructions.</p>
      </div>`,
    });
  } catch (error) {
    emailSent = false;
    console.error(JSON.stringify({
      level: 'error',
      event: 'accommodation_invoice_email_failed',
      invoice_id: updatedInvoice.id,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }

  await createStaffNotification(client, {
    staffId: staff.id,
    category: 'billing',
    title: automatic ? 'Accommodation invoice issued automatically' : 'Accommodation invoice issued',
    body: `Your accommodation invoice ${updatedInvoice.invoice_number} for €${Number(updatedInvoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR (GBP equivalent ≈ £${accommodationGbpEquivalent(Number(updatedInvoice.amount_eur)).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP) has been issued. Open the invoice from the Staff Portal to review your selected accommodation arrangement, amount and terms. Email manager@bimedhealthcare.com when you are ready to request payment details.`,
    actionUrl: `/invoices/accommodation/${updatedInvoice.public_token}`,
  });

  await createStaffAudit(client, {
    staffId: staff.id,
    actor,
    eventType: automatic ? 'accommodation_invoice_auto_issued' : 'accommodation_invoice_issued',
    metadata: {
      invoice_number: updatedInvoice.invoice_number,
      amount_eur: updatedInvoice.amount_eur,
      issued_at: updatedInvoice.issued_at,
      email_sent: emailSent,
      automatic,
    },
  });

  return {
    invoice: updatedInvoice,
    publicUrl,
    alreadyIssued: false,
    emailSent,
  };
}


export async function cancelAccommodationInvoice(input: {
  client: SupabaseClient;
  invoice: any;
  staff: InvoiceStaff;
  actor: string;
}) {
  const { client, invoice, staff, actor } = input;
  if (!invoice) throw new Error('ACCOMMODATION_INVOICE_NOT_FOUND');

  const { data, error } = await client.rpc('bimed_cancel_accommodation_invoice', {
    p_invoice_id: invoice.id,
    p_actor: actor,
  });

  if (error || !data?.invoice) {
    throw new Error(error?.message || 'ACCOMMODATION_INVOICE_CANCEL_FAILED');
  }

  const cancelledInvoice = data.invoice;
  await createStaffNotification(client, {
    staffId: staff.id,
    category: 'billing',
    title: 'Accommodation invoice cancelled',
    body: `BIMED has cancelled accommodation invoice ${cancelledInvoice.invoice_number}.`,
    actionUrl: '/staff/permit',
  });

  await createStaffAudit(client, {
    staffId: staff.id,
    actor,
    eventType: 'accommodation_invoice_cancelled',
    metadata: { invoice_number: cancelledInvoice.invoice_number, atomic_workflow: true },
  });

  return cancelledInvoice;
}
