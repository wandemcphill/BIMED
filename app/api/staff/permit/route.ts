import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { createStaffNotification } from '@/lib/staff';
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
    if (body?.acknowledged !== true) return NextResponse.json({ error: 'Please confirm that you understand and accept the compulsory accommodation payment and refund terms before continuing.' }, { status: 400 });
    if (currentInvoice && !permit.accommodation_terms_acknowledged_at) return NextResponse.json({ error: 'An accommodation invoice already exists for this case. BIMED should review the case before another acknowledgement is recorded.' }, { status: 409 });

    let result: any;
    try {
      result = await client.rpc('bimed_acknowledge_staff_accommodation', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_terms_version: ACCOMMODATION_TERMS_VERSION,
        p_amount_eur: ACCOMMODATION_AMOUNT_EUR,
        p_period_months: ACCOMMODATION_PERIOD_MONTHS,
        p_refund_installments: ACCOMMODATION_REFUND_INSTALLMENTS,
        p_bill_to_email: application?.email || '',
        p_invoice_description: `Accommodation arrangement for the initial ${ACCOMMODATION_PERIOD_MONTHS}-month probationary period`,
        p_invoice_notes: `Refund arrangement: €${ACCOMMODATION_AMOUNT_EUR.toFixed(2)} after qualifying refusal; after successful probation, refund in ${ACCOMMODATION_REFUND_INSTALLMENTS} weekly instalments, subject to the agreed accommodation terms.`,
        p_invoice_number: makeInvoiceNumber(),
        p_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to record the accommodation acknowledgement.');
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_acknowledgement_atomic_failed', staff_id: staff.id, reason: error instanceof Error ? error.message : String(error) }));
      return NextResponse.json({ error: 'Unable to record the accommodation acknowledgement. No partial acknowledgement was saved.' }, { status: 500 });
    }

    if (!result.data.already_acknowledged) {
      const subject = `Accommodation payment request: ${staff.full_name} (${staff.bimed_id})`;
      const bodyHtml = `<div style="font-family:Arial,sans-serif;color:#172b4d"><h2>Accommodation payment request</h2><p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has acknowledged the compulsory BIMED accommodation payment arrangement.</p><p>Amount: <strong>€${ACCOMMODATION_AMOUNT_EUR.toFixed(2)}</strong><br>Period: <strong>${ACCOMMODATION_PERIOD_MONTHS} months</strong><br>Terms version: <strong>${ACCOMMODATION_TERMS_VERSION}</strong></p><p>The candidate acknowledged the compulsory payment, refund and accommodation terms presented in the Staff Portal. The invoice is currently <strong>${result.data.invoice_status}</strong>. The permit journey and flight-planning workflow unlock only after BIMED issues the invoice.</p><p><a href="${appUrl()}/admin/permit/billing/${staff.id}">Open the billing workspace</a></p></div>`;
      try {
        await sendAccommodationEmail({ to: ['overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'], subject, html: bodyHtml });
      } catch (emailError) {
        console.error(JSON.stringify({ level: 'error', event: 'accommodation_acknowledgement_email_failed', staff_id: staff.id, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
      }
      await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation acknowledgement recorded', body: 'BIMED has recorded the compulsory accommodation arrangement. The billing team has been notified. Your permit-assistance request and flight-planning workspace will unlock after the accommodation invoice is issued.', actionUrl: '/staff/permit' });
    }
    return NextResponse.json({ permit: { id: result.data.permit_id }, invoice: { id: result.data.invoice_id, invoice_number: result.data.invoice_number, status: result.data.invoice_status }, already_acknowledged: Boolean(result.data.already_acknowledged) }, { status: result.data.already_acknowledged ? 200 : 201 });
  }

  if (action === 'request_sponsorship') {
    if (!isAccommodationReady(currentInvoice)) return NextResponse.json({ error: 'Your accommodation invoice must be issued by BIMED before you can request BIMED to begin the employment-permit / sponsorship journey.' }, { status: 409 });
    const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
    if (['permit_granted','visa_granted','arrived','closed'].includes(current.status)) return NextResponse.json({ error: 'This permit journey has already progressed beyond the request stage.' }, { status: 409 });
    if (current.status === 'requested' || current.requested_at) return NextResponse.json({ permit: current, already_requested: true }, { status: 200 });
    const now = new Date().toISOString();
    const { data: updated, error } = await client.from('recruitment_staff_permit_cases').update({ status: 'requested', requested_at: now, updated_at: now }).eq('staff_id', staff.id).select('*').single();
    if (error || !updated) return NextResponse.json({ error: 'Unable to submit the sponsorship request.' }, { status: 500 });
    await createStaffNotification(client, { staffId: staff.id, category: 'permit', title: 'Employment permit assistance requested', body: 'Your accommodation invoice has been issued and your request for BIMED to begin the employment permit / sponsorship journey has been received. BIMED will review your complete staff profile and prepare the employer-side documentation.', actionUrl: '/staff/permit' });
    return NextResponse.json({ permit: updated, already_requested: false }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unsupported permit action.' }, { status: 400 });
}
