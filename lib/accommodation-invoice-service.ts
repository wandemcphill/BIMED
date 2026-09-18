import type { SupabaseClient } from '@supabase/supabase-js';
import { appUrl, ACCOMMODATION_PAYMENT_ACCOUNT, sendAccommodationEmail } from '@/lib/accommodation-billing';
import { invoiceHtml } from '@/lib/accommodation-documents';
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

  const { data: account } = await client
    .from('recruitment_payment_accounts')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  const accountSnapshot = account
    ? {
        account_name: account.account_name,
        bank_name: account.bank_name,
        iban: account.iban,
        bic_swift: account.bic_swift,
        account_number: account.account_number,
        sort_code: account.sort_code,
        branch_details: account.branch_details,
        payment_reference_instructions: account.payment_reference_instructions,
        currency: account.currency,
      }
    : ACCOMMODATION_PAYMENT_ACCOUNT;

  const now = new Date();
  const issuedAt = now.toISOString();
  const issueDate = issuedAt.slice(0, 10);
  const dueDate = invoice.due_date || new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: updatedInvoice, error: invoiceError } = await client
    .from('recruitment_accommodation_invoices')
    .update({
      status: 'issued',
      issue_date: issueDate,
      due_date: dueDate,
      issued_at: issuedAt,
      payment_account_snapshot: accountSnapshot,
      updated_at: issuedAt,
    })
    .eq('id', invoice.id)
    .eq('status', 'draft')
    .select('*')
    .single();

  if (invoiceError || !updatedInvoice) {
    throw new Error('ACCOMMODATION_INVOICE_ISSUE_FAILED');
  }

  await client
    .from('recruitment_staff_permit_cases')
    .update({
      accommodation_payment_status: 'invoice_issued',
      updated_at: issuedAt,
    })
    .eq('id', permit.id);

  const publicUrl = `${appUrl()}/invoices/accommodation/${updatedInvoice.public_token}`;
  const candidateEmail = application?.email || staff.email;
  const recipients = Array.from(new Set([candidateEmail, 'overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'].filter(Boolean)));

  let emailSent = true;
  try {
    await sendAccommodationEmail({
      to: recipients,
      subject: `BIMED accommodation invoice ${updatedInvoice.invoice_number} is ready`,
      html: `<div style="font-family:Arial,sans-serif;color:#172b4d">
        <h2>Your BIMED accommodation invoice is ready</h2>
        <p>Hello ${staff.full_name},</p>
        <p>Your accommodation invoice <strong>${updatedInvoice.invoice_number}</strong> has been issued.</p>
        <p>Please open the invoice in the BIMED Staff Portal to review the accommodation terms, amount due, and the official payment details.</p>
        <p><a href="${publicUrl}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800">Open accommodation invoice</a></p>
        <p style="font-size:12px;color:#627d98">For security and accuracy, the bank account and payment instructions are displayed on the portal invoice itself rather than repeated in this email.</p>
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
    body: `Your accommodation invoice ${updatedInvoice.invoice_number} for €${Number(updatedInvoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} has been issued. Open the invoice from the Staff Portal to review the payment details and terms.`,
    actionUrl: `/invoices/accommodation/${updatedInvoice.public_token}`,
  });

  await createStaffAudit(client, {
    staffId: staff.id,
    actor,
    eventType: automatic ? 'accommodation_invoice_auto_issued' : 'accommodation_invoice_issued',
    metadata: {
      invoice_number: updatedInvoice.invoice_number,
      amount_eur: updatedInvoice.amount_eur,
      issued_at: issuedAt,
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
