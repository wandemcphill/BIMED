import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import {
  ACCOMMODATION_AMOUNT_EUR,
  ACCOMMODATION_PERIOD_MONTHS,
  ACCOMMODATION_REFUND_INSTALLMENTS,
  ACCOMMODATION_TERMS_VERSION,
  appUrl,
  makeInvoiceNumber,
  makePublicToken,
  sendAccommodationEmail,
} from '@/lib/accommodation-billing';

function completeProfilePacket(staff: any, application: any, permit: any) {
  return {
    generated_at: new Date().toISOString(),
    employee: {
      bimed_id: staff.bimed_id,
      full_name: staff.full_name,
      preferred_name: staff.preferred_name,
      personal_or_delivery_email: application?.email || null,
      internal_portal_email: staff.email,
      phone: staff.phone,
      date_of_birth: staff.date_of_birth,
      nationality: staff.nationality,
      residential_address: [staff.address_line_1, staff.address_line_2, staff.city, staff.county, staff.eircode, staff.country].filter(Boolean).join(', '),
    },
    employment: {
      employer: 'Bimed Healthcare Limited',
      position: staff.job_title || staff.role,
      department: staff.department,
      employment_type: staff.employment_type,
      start_date: staff.employment_start_date,
      manager: staff.manager_name,
      primary_location: staff.primary_location,
      annual_salary_eur: application?.role_applied ? ({ 'Support Worker': 36000, 'Healthcare Assistant': 36000, 'Senior Support Worker': 41000, Physiotherapist: 55000 } as Record<string, number>)[application.role_applied] || null : null,
    },
    immigration: {
      pathway: permit.pathway,
      permit_type: permit.permit_type,
      permit_application_id: permit.permit_application_id,
      work_authorised: permit.work_authorised,
      visa_status: permit.visa_status,
      visa_application_reference: permit.visa_application_reference,
    },
    accommodation: {
      offered_by_bimed: permit.accommodation_offered,
      period_months: permit.accommodation_period_months,
      amount_eur: permit.accommodation_amount_eur,
      start_date: permit.accommodation_start_date,
      end_date: permit.accommodation_end_date,
      payment_status: permit.accommodation_payment_status,
      refund_policy_amount_eur: permit.accommodation_refund_amount_eur,
      refund_installments: permit.accommodation_refund_installments,
      refund_status: permit.accommodation_refund_status,
      terms_acknowledged_at: permit.accommodation_terms_acknowledged_at,
      invoice_requested_at: permit.accommodation_invoice_requested_at,
    },
    evidence_checklist: {
      signed_contract: true,
      employer_letter: true,
      job_description: true,
      accommodation_offer: permit.accommodation_offered,
      accommodation_agreement: Boolean(permit.accommodation_agreement_path),
      qualification_evidence: true,
      passport_identity: true,
      financial_evidence: 'Applicant remains responsible for any financial evidence required by Irish Immigration/DETE. Accommodation documentation does not guarantee or replace a requirement unless the relevant authority confirms otherwise.',
    },
  };
}

function isAccommodationReady(invoice: any) {
  return invoice?.status === 'issued' || invoice?.status === 'paid';
}

async function getPermitContext(staffId: string) {
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('*').eq('id', staffId).maybeSingle();
  if (!staff) return { client, staff: null, permit: null, application: null, invoice: null };
  const [{ data: permit }, { data: application }] = await Promise.all([
    client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle(),
    client.from('recruitment_applications').select('id,email,full_name,role_applied,country_of_residence,living_in_ireland,work_permission,start_date').eq('id', staff.application_id).maybeSingle(),
  ]);
  const invoice = permit ? (await client.from('recruitment_accommodation_invoices').select('*').eq('permit_case_id', permit.id).maybeSingle()).data : null;
  return { client, staff, permit, application, invoice };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staff, permit, application, invoice } = await getPermitContext(session.staff_id);
  if (!staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  if (!staff.application_id || staff.status !== 'pre_arrival') return NextResponse.json({ error: 'The overseas permit workspace is only available to overseas recruitment-linked staff.' }, { status: 403 });
  if (!permit) return NextResponse.json({ error: 'Permit case has not been initialized.' }, { status: 404 });
  return NextResponse.json({
    permit,
    packet: completeProfilePacket(staff, application, permit),
    invoice: invoice ? { id: invoice.id, invoice_number: invoice.invoice_number, public_token: invoice.public_token, status: invoice.status, issue_date: invoice.issue_date, due_date: invoice.due_date, amount_eur: invoice.amount_eur } : null,
    invoiceUrl: invoice ? `${appUrl()}/invoices/accommodation/${invoice.public_token}` : null,
    accommodationReady: isAccommodationReady(invoice),
  });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { client, staff, permit, application, invoice: currentInvoice } = await getPermitContext(session.staff_id);
  if (!staff || !staff.application_id || staff.status !== 'pre_arrival') return NextResponse.json({ error: 'The overseas permit workspace is only available to overseas recruitment-linked staff.' }, { status: 403 });
  if (!permit) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
  const body = await request.json().catch(() => null) as any;
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'acknowledge_accommodation') {
    if (permit.accommodation_terms_acknowledged_at) return NextResponse.json({ error: 'The accommodation arrangement has already been acknowledged.' }, { status: 409 });
    if (body?.acknowledged !== true) return NextResponse.json({ error: 'Please confirm that you understand and accept the compulsory accommodation payment and refund terms before continuing.' }, { status: 400 });

    const now = new Date().toISOString();
    const { data: updatedPermit, error: permitError } = await client.from('recruitment_staff_permit_cases').update({
      accommodation_terms_acknowledged_at: now,
      accommodation_terms_version: ACCOMMODATION_TERMS_VERSION,
      accommodation_terms_acknowledged_name: staff.full_name,
      accommodation_invoice_requested_at: now,
      accommodation_payment_status: isAccommodationReady(currentInvoice) ? 'invoice_issued' : 'invoice_requested',
      updated_at: now,
    }).eq('id', permit.id).select('*').single();
    if (permitError || !updatedPermit) return NextResponse.json({ error: 'Unable to record the acknowledgement.' }, { status: 500 });

    let invoice = currentInvoice;
    if (!invoice) {
      const { data: createdInvoice, error: invoiceError } = await client.from('recruitment_accommodation_invoices').insert({
        permit_case_id: permit.id,
        invoice_number: makeInvoiceNumber(),
        public_token: makePublicToken(),
        status: 'draft',
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        amount_eur: ACCOMMODATION_AMOUNT_EUR,
        currency: 'EUR',
        description: `Accommodation arrangement for the initial ${ACCOMMODATION_PERIOD_MONTHS}-month probationary period`,
        bill_to_name: staff.full_name,
        bill_to_email: application?.email || null,
        notes: `Refund arrangement: €${ACCOMMODATION_AMOUNT_EUR.toFixed(2)} after qualifying refusal; after successful probation, refund in ${ACCOMMODATION_REFUND_INSTALLMENTS} weekly instalments, subject to the agreed accommodation terms.`,
      }).select('*').single();
      if (invoiceError || !createdInvoice) return NextResponse.json({ error: 'Acknowledgement was saved, but the invoice request could not be created. BIMED should review the case.' }, { status: 500 });
      invoice = createdInvoice;
    }

    const subject = `Accommodation payment request: ${staff.full_name} (${staff.bimed_id})`;
    const bodyHtml = `<div style="font-family:Arial,sans-serif;color:#172b4d"><h2>Accommodation payment request</h2><p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has acknowledged the compulsory BIMED accommodation payment arrangement.</p><p>Amount: <strong>€${ACCOMMODATION_AMOUNT_EUR.toFixed(2)}</strong><br>Period: <strong>${ACCOMMODATION_PERIOD_MONTHS} months</strong><br>Terms version: <strong>${ACCOMMODATION_TERMS_VERSION}</strong></p><p>The candidate acknowledged the compulsory payment, refund and accommodation terms presented in the Staff Portal. The invoice is currently <strong>${invoice.status}</strong>. The permit journey and flight-planning workflow unlock only after BIMED issues the invoice.</p><p><a href="${appUrl()}/admin/permit/billing/${staff.id}">Open the billing workspace</a></p></div>`;
    try {
      await sendAccommodationEmail({ to: ['overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'], subject, html: bodyHtml });
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_acknowledgement_email_failed', staff_id: staff.id, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
    }
    await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation acknowledgement recorded', body: 'BIMED has recorded the compulsory accommodation arrangement. The billing team has been notified. Your permit-assistance request and flight-planning workspace will unlock after the accommodation invoice is issued.', actionUrl: '/staff/permit' });
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'accommodation_terms_acknowledged', metadata: { terms_version: ACCOMMODATION_TERMS_VERSION, invoice_id: invoice.id, invoice_number: invoice.invoice_number, compulsory: true } });
    return NextResponse.json({ permit: updatedPermit, invoice: { invoice_number: invoice.invoice_number, status: invoice.status } }, { status: 201 });
  }

  if (action === 'request_sponsorship') {
    if (!isAccommodationReady(currentInvoice)) return NextResponse.json({ error: 'Your accommodation invoice must be issued by BIMED before you can request BIMED to begin the employment-permit / sponsorship journey.' }, { status: 409 });
    const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
    if (['permit_granted','visa_granted','arrived','closed'].includes(current.status)) return NextResponse.json({ error: 'This permit journey has already progressed beyond the request stage.' }, { status: 409 });
    const now = new Date().toISOString();
    const { data: updated, error } = await client.from('recruitment_staff_permit_cases').update({ status: 'requested', requested_at: current.requested_at || now, updated_at: now }).eq('staff_id', staff.id).select('*').single();
    if (error || !updated) return NextResponse.json({ error: 'Unable to submit the sponsorship request.' }, { status: 500 });
    await createStaffNotification(client, { staffId: staff.id, category: 'permit', title: 'Employment permit assistance requested', body: 'Your accommodation invoice has been issued and your request for BIMED to begin the employment permit / sponsorship journey has been received. BIMED will review your complete staff profile and prepare the employer-side documentation.', actionUrl: '/staff/permit' });
    await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'employment_permit_requested', metadata: { status: 'requested', accommodation_invoice_id: currentInvoice.id, accommodation_invoice_status: currentInvoice.status } });
    return NextResponse.json({ permit: updated }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unsupported permit action.' }, { status: 400 });
}
