import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import {
  appUrl,
  makeInvoiceNumber,
  makePublicToken,
  sendAccommodationEmail,
} from '@/lib/accommodation-billing';
import {
  ACCOMMODATION_OPTIONS_TERMS_VERSION,
  ACCOMMODATION_REFUND_INSTALLMENTS,
  derivePermitType,
  getAccommodationSelection,
  legacyAccommodationSelection,
  permitSubmissionLabel,
  validateAccommodationSelection,
  type PermitSubmissionRoute,
  type AccommodationPlan,
} from '@/lib/employment-permit-options';

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
      role_applied: application?.role_applied || staff.job_title || staff.role,
      annual_salary_eur: application?.role_applied ? ({ 'Support Worker': 36000, 'Healthcare Assistant': 36000, 'Senior Support Worker': 41000, Physiotherapist: 55000 } as Record<string, number>)[application.role_applied] || null : null,
    },
    immigration: {
      pathway: permit.pathway,
      permit_type: permit.permit_type,
      permit_application_id: permit.permit_application_id,
      work_authorised: permit.work_authorised,
      visa_status: permit.visa_status,
      visa_application_reference: permit.visa_application_reference,
      submission_route: permit.permit_submission_route,
      permit_fee_eur: permit.permit_fee_eur,
      permit_duration_months: permit.permit_duration_months,
      registration_fee_guidance_eur: 300,
    },
    accommodation: {
      offered_by_bimed: permit.accommodation_offered,
      plan: permit.accommodation_plan,
      period_months: permit.accommodation_period_months,
      amount_eur: permit.accommodation_amount_eur,
      start_date: permit.accommodation_start_date,
      end_date: permit.accommodation_end_date,
      payment_status: permit.accommodation_payment_status,
      refund_amount_eur: permit.accommodation_refund_amount_eur,
      refund_installments: permit.accommodation_refund_installments,
      refund_trigger: permit.accommodation_refund_trigger,
      refund_status: permit.accommodation_refund_status,
      terms_acknowledged_at: permit.accommodation_terms_acknowledged_at,
      invoice_requested_at: permit.accommodation_invoice_requested_at,
      selection_snapshot: permit.accommodation_selection_snapshot || {},
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

function deriveCurrentSelection(application: any, permit: any) {
  if (permit.accommodation_plan && permit.permit_submission_route) {
    return getAccommodationSelection(permit.accommodation_plan, permit.permit_submission_route, application?.role_applied);
  }
  if (permit.accommodation_terms_acknowledged_at) return legacyAccommodationSelection(application?.role_applied, permit.permit_type);
  return null;
}

function buildChoiceCatalog(roleValue: string | null | undefined) {
  const options: any[] = [];
  for (const plan of ['three_months_4000', 'one_month_1250'] as const) {
    for (const route of ['candidate_or_agency', 'bimed_legal_team'] as const) {
      try { options.push(getAccommodationSelection(plan, route, roleValue)); } catch { /* Unsupported role is handled by the acknowledgement endpoint. */ }
    }
  }
  return options;
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { staff, permit, application, invoice } = await getPermitContext(session.staff_id);
  if (!staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  if (!staff.application_id || staff.status !== 'pre_arrival') return NextResponse.json({ error: 'The overseas permit workspace is only available to overseas recruitment-linked staff.' }, { status: 403 });
  if (!permit) return NextResponse.json({ error: 'Permit case has not been initialized.' }, { status: 404 });
  const selection = deriveCurrentSelection(application, permit);
  const derivedPermitType = derivePermitType(application?.role_applied);
  return NextResponse.json({
    permit,
    packet: completeProfilePacket(staff, application, permit),
    role: application?.role_applied || staff.job_title || staff.role || null,
    derivedPermitType,
    accommodationSelection: selection,
    accommodationOptions: buildChoiceCatalog(application?.role_applied),
    needsLegacyPermitRouteSelection: Boolean(permit.accommodation_terms_acknowledged_at && !permit.permit_submission_route && invoice?.status === 'draft'),
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
    if (body?.acknowledged !== true) return NextResponse.json({ error: 'Please confirm that you understand and accept the selected accommodation, payment, refund and permit-route terms before continuing.' }, { status: 400 });
    if (currentInvoice && !permit.accommodation_terms_acknowledged_at) return NextResponse.json({ error: 'An accommodation invoice already exists for this case. BIMED should review the case before another acknowledgement is recorded.' }, { status: 409 });
    if (permit.accommodation_terms_acknowledged_at) return NextResponse.json({ permit, invoice: currentInvoice, already_acknowledged: true }, { status: 200 });

    let selection;
    try {
      selection = validateAccommodationSelection({ plan: body?.accommodation_plan, route: body?.permit_submission_route, roleValue: application?.role_applied });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_ACCOMMODATION_SELECTION';
      const messages: Record<string, string> = {
        INVALID_ACCOMMODATION_PLAN: 'Select one of the available accommodation plans.',
        INVALID_PERMIT_SUBMISSION_ROUTE: 'Select who will submit and pay the employment permit application.',
        UNSUPPORTED_RECRUITMENT_ROLE: 'Your recruitment role is not currently configured for an employment-permit route. BIMED must review the role before acknowledgement can continue.',
      };
      return NextResponse.json({ error: messages[code] || 'The accommodation and permit selections could not be validated.' }, { status: 400 });
    }

    let result: any;
    try {
      result = await client.rpc('bimed_acknowledge_staff_accommodation_options', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_terms_version: ACCOMMODATION_OPTIONS_TERMS_VERSION,
        p_accommodation_plan: selection.accommodation_plan,
        p_permit_submission_route: selection.permit_submission_route,
        p_permit_type: selection.permit_type,
        p_amount_eur: selection.accommodation_amount_eur,
        p_period_months: selection.accommodation_period_months,
        p_refund_trigger: selection.accommodation_refund_trigger,
        p_refund_installments: selection.accommodation_refund_installments,
        p_permit_duration_months: selection.permit_duration_months,
        p_permit_fee_eur: selection.permit_fee_eur,
        p_selection_snapshot: selection,
        p_bill_to_email: application?.email || '',
        p_invoice_description: selection.accommodation_plan === 'one_month_1250'
          ? 'BIMED-arranged accommodation for the first month, including training, onboarding and shadow shifts'
          : 'BIMED-arranged accommodation for the initial three-month probationary period',
        p_invoice_notes: selection.refund_trigger === 'one_month_accommodation_expiry'
          ? `Refund trigger: the one-month accommodation arrangement expires. Refund processing follows the applicable accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`
          : `Refund trigger: successful three-month probationary period; refund in ${selection.accommodation_refund_installments} weekly instalments under the accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`,
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
      const bodyHtml = `<div style="font-family:Arial,sans-serif;color:#172b4d"><h2>Accommodation payment request</h2><p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has acknowledged the selected BIMED accommodation arrangement.</p><p>Accommodation: <strong>€${selection.accommodation_amount_eur.toFixed(2)}</strong> for <strong>${selection.accommodation_period_months} month${selection.accommodation_period_months === 1 ? '' : 's'}</strong><br>Plan: <strong>${selection.accommodation_plan_label}</strong><br>Permit route: <strong>${selection.permit_submission_label}</strong><br>Permit type: <strong>${selection.permit_type_label}</strong><br>Terms version: <strong>${ACCOMMODATION_OPTIONS_TERMS_VERSION}</strong></p><p>The invoice is currently <strong>${result.data.invoice_status}</strong>. Permit assistance and flight planning unlock after BIMED issues the invoice.</p><p><a href="${appUrl()}/admin/permit/billing/${staff.id}">Open the billing workspace</a></p></div>`;
      try {
        await sendAccommodationEmail({ to: ['overseas@bimedhealthcare.com', 'manager@bimedhealthcare.com'], subject, html: bodyHtml });
      } catch (emailError) {
        console.error(JSON.stringify({ level: 'error', event: 'accommodation_acknowledgement_email_failed', staff_id: staff.id, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
      }
      await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation arrangement recorded', body: `${selection.accommodation_plan_label} and the ${selection.permit_type_label} submission route have been recorded. The billing team has been notified.`, actionUrl: '/staff/permit' });
    }

    const { data: updatedPermit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', result.data.permit_id).single();
    return NextResponse.json({ permit: updatedPermit || { id: result.data.permit_id }, invoice: { id: result.data.invoice_id, invoice_number: result.data.invoice_number, status: result.data.invoice_status }, already_acknowledged: Boolean(result.data.already_acknowledged) }, { status: result.data.already_acknowledged ? 200 : 201 });
  }

  if (action === 'select_permit_route') {
    if (!permit.accommodation_terms_acknowledged_at) return NextResponse.json({ error: 'A permit submission route can only be selected after the accommodation acknowledgement.' }, { status: 409 });
    if (permit.permit_submission_route) {
      if (permit.permit_submission_route === body?.permit_submission_route) return NextResponse.json({ permit, already_selected: true });
      return NextResponse.json({ error: 'The permit submission route has already been recorded and cannot be changed from the Staff Portal.' }, { status: 409 });
    }
    if (!currentInvoice || currentInvoice.status !== 'draft') return NextResponse.json({ error: 'The permit route is locked because the accommodation invoice has already been issued or paid. BIMED can review any correction through its controlled admin process.' }, { status: 409 });
    let route: PermitSubmissionRoute;
    try {
      if (!['candidate_or_agency', 'bimed_legal_team'].includes(body?.permit_submission_route)) throw new Error('INVALID_PERMIT_SUBMISSION_ROUTE');
      route = body.permit_submission_route;
      const plan = (permit.accommodation_plan || 'three_months_4000') as AccommodationPlan;
      const selection = getAccommodationSelection(plan, route, application?.role_applied);
      const now = new Date().toISOString();
      const snapshot = { ...(permit.accommodation_selection_snapshot || {}), ...selection, legacy: true, terms_version: permit.accommodation_terms_version || '2026-09-14-v1' };
      const { data: updated, error } = await client.from('recruitment_staff_permit_cases').update({ permit_submission_route: route, permit_type: selection.permit_type, permit_fee_eur: selection.permit_fee_eur, permit_duration_months: selection.permit_duration_months, accommodation_refund_trigger: selection.accommodation_refund_trigger, accommodation_selection_snapshot: snapshot, updated_at: now }).eq('id', permit.id).eq('permit_submission_route', null).select('*').single();
      if (error || !updated) return NextResponse.json({ error: 'The legacy permit route could not be recorded. Refresh the case and try again.' }, { status: 409 });
      const { error: invoiceError } = await client.from('recruitment_accommodation_invoices').update({ arrangement_snapshot: snapshot, updated_at: now }).eq('id', currentInvoice.id).eq('status', 'draft');
      if (invoiceError) return NextResponse.json({ error: 'The permit route was recorded but the draft invoice snapshot could not be updated. BIMED should review the case before issuing the invoice.' }, { status: 500 });
      await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'legacy_permit_submission_route_selected', metadata: { permit_submission_route: route, permit_type: selection.permit_type, invoice_id: currentInvoice.id } });
      return NextResponse.json({ permit: updated, already_selected: false });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'UNSUPPORTED_RECRUITMENT_ROLE' ? 'Your recruitment role is not configured for the employment-permit route. BIMED must review the role.' : 'Invalid permit submission route.' }, { status: 400 });
    }
  }

  if (action === 'request_sponsorship') {
    if (!isAccommodationReady(currentInvoice)) return NextResponse.json({ error: 'Your accommodation invoice must be issued by BIMED before you can request BIMED to begin the employment-permit / sponsorship journey.' }, { status: 409 });
    const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
    if (!current.permit_submission_route || !current.permit_type) return NextResponse.json({ error: 'Select the employment-permit submission route before requesting permit assistance.' }, { status: 409 });
    if (['permit_granted','visa_granted','arrived','closed'].includes(current.status)) return NextResponse.json({ error: 'This permit journey has already progressed beyond the request stage.' }, { status: 409 });
    if (current.status === 'requested' || current.requested_at) return NextResponse.json({ permit: current, already_requested: true }, { status: 200 });
    const now = new Date().toISOString();
    const { data: updated, error } = await client.from('recruitment_staff_permit_cases').update({ status: 'requested', requested_at: now, updated_at: now }).eq('staff_id', staff.id).select('*').single();
    if (error || !updated) return NextResponse.json({ error: 'Unable to submit the sponsorship request.' }, { status: 500 });
    await createStaffNotification(client, { staffId: staff.id, category: 'permit', title: 'Employment permit assistance requested', body: `Your ${updated.permit_type === 'critical_skills_employment_permit' ? 'Critical Skills Employment Permit' : 'General Employment Permit'} route has been selected and your request has been received. BIMED will review your complete profile and prepare the relevant documentation.`, actionUrl: '/staff/permit' });
    return NextResponse.json({ permit: updated, already_requested: false }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unsupported permit action.' }, { status: 400 });
}
