import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { issueAccommodationInvoice } from '@/lib/accommodation-invoice-service';
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
import {
  requestStaffSponsorshipCancellationAtomic,
  revokeStaffSponsorshipCancellationAtomic,
} from '@/lib/staff-portal-workflow';

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
  for (const plan of ['three_months_4000', 'three_months_shared_2000', 'one_month_1250', 'one_month_shared_625'] as const) {
    for (const route of ['candidate_or_agency', 'bimed_legal_team'] as const) {
      try { options.push(getAccommodationSelection(plan, route, roleValue)); } catch { /* Unsupported role is handled by the acknowledgement endpoint. */ }
    }
  }
  return options;
}

async function getSharedBillingRecovery(client: any, permit: any) {
  if (!permit?.accommodation_share_id) return null;
  const { data: share } = await client
    .from('recruitment_accommodation_shares')
    .select('id,share_reference,status,primary_staff_id,partner_staff_id')
    .eq('id', permit.accommodation_share_id)
    .maybeSingle();
  if (!share) return null;

  const { data: permits } = await client
    .from('recruitment_staff_permit_cases')
    .select('id,staff_id')
    .in('id', [share.primary_staff_id, share.partner_staff_id]);
  if (!permits?.length) return null;

  const { data: invoices } = await client
    .from('recruitment_accommodation_invoices')
    .select('id,permit_case_id,invoice_number,status,amount_eur')
    .in('permit_case_id', permits.map((item: any) => item.id));

  const invoiceByPermit = Object.fromEntries((invoices || []).map((item: any) => [item.permit_case_id, item]));
  const primaryPermit = permits.find((item: any) => item.staff_id === share.primary_staff_id);
  const partnerPermit = permits.find((item: any) => item.staff_id === share.partner_staff_id);
  const primaryInvoice = primaryPermit ? invoiceByPermit[primaryPermit.id] || null : null;
  const partnerInvoice = partnerPermit ? invoiceByPermit[partnerPermit.id] || null : null;

  return {
    shareReference: share.share_reference,
    shareStatus: share.status,
    primaryInvoice: primaryInvoice ? {
      invoiceNumber: primaryInvoice.invoice_number,
      status: primaryInvoice.status,
      amountEur: primaryInvoice.amount_eur,
    } : null,
    partnerInvoice: partnerInvoice ? {
      invoiceNumber: partnerInvoice.invoice_number,
      status: partnerInvoice.status,
      amountEur: partnerInvoice.amount_eur,
    } : null,
    needsRecovery: Boolean(
      primaryInvoice &&
      partnerInvoice &&
      [primaryInvoice.status, partnerInvoice.status].some((status) => status === 'draft'),
    ),
  };
}

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { client, staff, permit, application, invoice } = await getPermitContext(session.staff_id);
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
    sharedBillingRecovery: await getSharedBillingRecovery(client, permit),
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

  if (action === 'request_sponsorship_cancellation') {
    if (!currentInvoice || !['issued', 'payment_reported', 'cancellation_requested'].includes(currentInvoice.status)) {
      return NextResponse.json({ error: 'There is no active accommodation invoice available to reject.' }, { status: 409 });
    }
    const reason = typeof body?.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : 'Candidate rejected the accommodation fee and requested cancellation of the accommodation invoice.';

    try {
      const result = await requestStaffSponsorshipCancellationAtomic(client, {
        staffId: staff.id,
        actor: session.email,
        reason,
      });

      if (result.already_requested) {
        const { data: existingPermit } = await client
          .from('recruitment_staff_permit_cases')
          .select('*')
          .eq('id', permit.id)
          .single();
        return NextResponse.json({
          ok: true,
          permit: existingPermit || permit,
          cancellationDeadline: result.deadline_at,
          status: 'cancellation_requested',
          alreadyRequested: true,
        }, { status: 200 });
      }

      const deadline = result.deadline_at;
      const candidateEmail = application?.email || staff.email;
      const subject = `Sponsorship cancellation submitted: ${staff.full_name} (${staff.bimed_id})`;
      const html = `<div style="font-family:Arial,sans-serif;color:#172b4d">
        <h2>Accommodation fee rejection / sponsorship cancellation</h2>
        <p><strong>${staff.full_name}</strong> (${staff.bimed_id}) has rejected the accommodation fee and submitted a cancellation of the BIMED accommodation invoice <strong>${result.invoice_number}</strong>.</p>
        <p>The candidate has a <strong>24-hour reversal window</strong> ending at <strong>${deadline}</strong>. During that window, the candidate may sign in to the Staff Portal and revoke the cancellation to continue the application.</p>
        <p>If the cancellation is not revoked before the deadline, BIMED's workflow will automatically restrict Staff Portal access, withdraw the recruitment application, void the employment contract and end the employment-permit / sponsorship journey.</p>
        <p>Reason recorded: ${reason}</p>
        <p><a href="${appUrl()}/admin/billing">Open the accommodation invoice queue</a></p>
      </div>`;

      try {
        await sendAccommodationEmail({
          to: [candidateEmail, 'info@bimedhealthcare.com'],
          subject,
          html,
        });
      } catch (emailError) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'sponsorship_cancellation_email_failed',
          staff_id: staff.id,
          invoice_id: result.invoice_id,
          reason: emailError instanceof Error ? emailError.message : String(emailError),
        }));
      }

      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'permit',
        title: 'Cancellation submitted: 24-hour reversal window started',
        body: `You rejected the accommodation fee. You can revoke this cancellation in the Staff Portal before ${deadline} to continue your application. If you do not revoke it within 24 hours, BIMED will restrict portal access, withdraw your application, void the employment contract and end the employment-permit / sponsorship journey.`,
        actionUrl: '/staff/permit',
      });

      const { data: updatedPermit } = await client
        .from('recruitment_staff_permit_cases')
        .select('*')
        .eq('id', permit.id)
        .single();

      return NextResponse.json({
        ok: true,
        permit: updatedPermit || { ...permit, cancellation_requested_at: new Date().toISOString(), cancellation_deadline_at: deadline },
        cancellationDeadline: deadline,
        status: 'cancellation_requested',
      }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const mapped: Record<string, { message: string; status: number }> = {
        SPONSORSHIP_CANCELLATION_FINALIZED: {
          message: 'The sponsorship cancellation has already been finalised. Portal access and the recruitment record cannot be restored through the Staff Portal.',
          status: 409,
        },
        SPONSORSHIP_CANCELLATION_DEADLINE_PASSED: {
          message: 'The 24-hour cancellation window has already expired. BIMED is processing the withdrawal and portal restriction.',
          status: 409,
        },
        ACCOMMODATION_INVOICE_NOT_CANCELABLE: {
          message: 'The accommodation invoice is no longer available for cancellation.',
          status: 409,
        },
      };
      const handled = mapped[message];
      return NextResponse.json(
        { error: handled?.message || 'Unable to record the sponsorship cancellation.' },
        { status: handled?.status || 500 },
      );
    }
  }

  if (action === 'revoke_sponsorship_cancellation') {
    try {
      const result = await revokeStaffSponsorshipCancellationAtomic(client, {
        staffId: staff.id,
        actor: session.email,
      });

      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'permit',
        title: 'Cancellation revoked',
        body: 'Your cancellation has been revoked within the 24-hour reversal window. Your application and accommodation invoice have been restored and you may continue with your BIMED onboarding and sponsorship journey.',
        actionUrl: '/staff/permit',
      });

      try {
        await sendAccommodationEmail({
          to: [application?.email || staff.email, 'info@bimedhealthcare.com'],
          subject: `Sponsorship cancellation revoked: ${staff.full_name} (${staff.bimed_id})`,
          html: `<div style="font-family:Arial,sans-serif;color:#172b4d">
            <h2>Sponsorship cancellation revoked</h2>
            <p><strong>${staff.full_name}</strong> (${staff.bimed_id}) revoked the accommodation-fee cancellation for invoice <strong>${result.invoice_number}</strong> within the 24-hour reversal window.</p>
            <p>The accommodation invoice has been restored to <strong>${result.restored_invoice_status}</strong> and the candidate may continue the BIMED application.</p>
          </div>`,
        });
      } catch (emailError) {
        console.error(JSON.stringify({
          level: 'error',
          event: 'sponsorship_cancellation_revoke_email_failed',
          staff_id: staff.id,
          invoice_id: result.invoice_id,
          reason: emailError instanceof Error ? emailError.message : String(emailError),
        }));
      }

      const { data: updatedPermit } = await client
        .from('recruitment_staff_permit_cases')
        .select('*')
        .eq('id', permit.id)
        .single();

      return NextResponse.json({
        ok: true,
        permit: updatedPermit || { ...permit, cancellation_revoked_at: new Date().toISOString(), cancellation_deadline_at: null },
        status: 'restored',
      }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const mapped: Record<string, { message: string; status: number }> = {
        SPONSORSHIP_CANCELLATION_DEADLINE_PASSED: {
          message: 'The 24-hour reversal window has expired. The cancellation can no longer be revoked from the Staff Portal.',
          status: 409,
        },
        SPONSORSHIP_CANCELLATION_FINALIZED: {
          message: 'The cancellation has already been finalised and this account can no longer be restored through the Staff Portal.',
          status: 409,
        },
        NO_SPONSORSHIP_CANCELLATION: {
          message: 'There is no active sponsorship cancellation to revoke.',
          status: 409,
        },
      };
      const handled = mapped[message];
      return NextResponse.json(
        { error: handled?.message || 'Unable to revoke the sponsorship cancellation.' },
        { status: handled?.status || 500 },
      );
    }
  }


  if (action === 'retry_shared_accommodation_invoice_issuance') {
    if (permit.cancellation_requested_at || permit.cancellation_finalized_at) {
      return NextResponse.json({ error: 'Shared accommodation invoice recovery is unavailable while sponsorship cancellation is active or finalised.' }, { status: 409 });
    }

    const recovery = await getSharedBillingRecovery(client, permit);
    if (!recovery || recovery.shareStatus !== 'active' || !recovery.primaryInvoice || !recovery.partnerInvoice) {
      return NextResponse.json({ error: 'No recoverable shared accommodation invoice pair was found.' }, { status: 409 });
    }
    if (!recovery.needsRecovery) {
      return NextResponse.json({ ok: true, recovered: false, message: 'Both shared accommodation invoices are already issued.' }, { status: 200 });
    }

    const { data: share } = await client
      .from('recruitment_accommodation_shares')
      .select('id,primary_staff_id,partner_staff_id')
      .eq('id', permit.accommodation_share_id)
      .maybeSingle();
    if (!share) return NextResponse.json({ error: 'The shared accommodation relationship could not be loaded.' }, { status: 404 });

    const contexts = await Promise.all([
      getPermitContext(share.primary_staff_id),
      getPermitContext(share.partner_staff_id),
    ]);

    if (contexts.some((context) => !context.staff || !context.application || !context.permit || !context.invoice)) {
      return NextResponse.json({ error: 'The shared accommodation records are incomplete. BIMED needs to review the billing relationship.' }, { status: 500 });
    }

    const results: any[] = [];
    const failures: any[] = [];

    for (const context of contexts) {
      try {
        const issuance = await issueAccommodationInvoice({
          client,
          invoice: context.invoice,
          staff: context.staff,
          application: context.application,
          permit: context.permit,
          actor: session.email,
          automatic: true,
        });
        results.push({
          staffId: context.staff.id,
          bimedId: context.staff.bimed_id,
          invoiceNumber: issuance.invoice.invoice_number,
          status: issuance.invoice.status,
          alreadyIssued: issuance.alreadyIssued === true,
        });
      } catch (error) {
        failures.push({
          staffId: context.staff.id,
          bimedId: context.staff.bimed_id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const finalRecovery = await getSharedBillingRecovery(client, permit);
    if (failures.length) {
      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'billing',
        title: 'Shared accommodation billing recovery still pending',
        body: 'One or more shared accommodation invoices still needs billing recovery. The existing invoice records were preserved.',
        actionUrl: '/staff/permit',
      });
      return NextResponse.json({
        ok: false,
        recovered: false,
        partial: true,
        results,
        failures,
        sharedBillingRecovery: finalRecovery,
        error: 'BIMED could not issue every shared accommodation invoice yet. The arrangement is preserved and can be retried without creating duplicate invoices.',
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      recovered: true,
      results,
      sharedBillingRecovery: finalRecovery,
    }, { status: 200 });
  }

  if (permit.cancellation_requested_at
      && !permit.cancellation_revoked_at
      && !permit.cancellation_finalized_at) {
    return NextResponse.json({
      error: `Your sponsorship cancellation is pending. You must revoke it before ${permit.cancellation_deadline_at} to continue your application.`,
      code: 'SPONSORSHIP_CANCELLATION_PENDING',
      deadline: permit.cancellation_deadline_at,
    }, { status: 409 });
  }

  if (action === 'change_accommodation_selection') {
    if (permit.cancellation_requested_at || permit.cancellation_finalized_at) {
      return NextResponse.json({ error: 'The accommodation plan cannot be changed while the sponsorship cancellation workflow is active or finalised.' }, { status: 409 });
    }
    if (permit.status !== 'not_started' || permit.requested_at) {
      return NextResponse.json({ error: 'The accommodation plan can only be changed before the employment-permit request has been submitted.' }, { status: 409 });
    }
    if (!currentInvoice || !['draft', 'issued'].includes(currentInvoice.status) || currentInvoice.paid_at || currentInvoice.payment_reported_at) {
      return NextResponse.json({ error: 'The accommodation plan can only be changed before payment is reported or recorded.' }, { status: 409 });
    }
    if (!permit.accommodation_terms_acknowledged_at) {
      return NextResponse.json({ error: 'There is no existing accommodation selection to change.' }, { status: 409 });
    }
    if (body?.acknowledged !== true) {
      return NextResponse.json({ error: 'Please confirm the new accommodation plan before issuing the replacement invoice.' }, { status: 400 });
    }

    let selection;
    try {
      selection = validateAccommodationSelection({
        plan: body?.accommodation_plan,
        route: permit.permit_submission_route,
        roleValue: application?.role_applied,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_ACCOMMODATION_SELECTION';
      const messages: Record<string, string> = {
        INVALID_ACCOMMODATION_PLAN: 'Select one of the available accommodation plans.',
        INVALID_PERMIT_SUBMISSION_ROUTE: 'The existing permit submission route is invalid and BIMED must review the case.',
        UNSUPPORTED_RECRUITMENT_ROLE: 'Your recruitment role is not currently configured for an employment-permit route. BIMED must review the role before the accommodation plan can be changed.',
      };
      return NextResponse.json({ error: messages[code] || 'The accommodation plan could not be validated.' }, { status: 400 });
    }

    if (selection.accommodation_plan === permit.accommodation_plan) {
      return NextResponse.json({ error: 'Choose a different accommodation plan before saving the change.' }, { status: 400 });
    }

    let result: any;
    try {
      result = await client.rpc('bimed_change_staff_accommodation_selection', {
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
        p_invoice_number: makeInvoiceNumber(),
        p_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        p_invoice_description: selection.accommodation_plan === 'three_months_4000'
          ? 'BIMED-arranged accommodation for the initial three-month probationary period'
          : selection.accommodation_plan === 'one_month_shared_625'
            ? 'BIMED-arranged shared accommodation for the first month, including training, onboarding and shadow shifts'
            : 'BIMED-arranged accommodation for the first month, including training, onboarding and shadow shifts',
        p_invoice_notes: selection.refund_trigger === 'one_month_accommodation_expiry'
          ? `Refund trigger: the one-month accommodation arrangement expires. Refund processing follows the applicable accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`
          : `Refund trigger: successful three-month probationary period; refund in ${selection.accommodation_refund_installments} weekly instalments under the accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`,
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to change the accommodation selection.');
    } catch (error) {
      const reason = error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_plan_change_atomic_failed', staff_id: staff.id, reason }));
      const mapped: Record<string, { message: string; status: number }> = {
        ACCOMMODATION_PLAN_CHANGE_NOT_ALLOWED: {
          message: 'The accommodation plan can no longer be changed because payment or the permit journey has progressed.',
          status: 409,
        },
        ACCOMMODATION_PLAN_NO_CHANGE: {
          message: 'Choose a different accommodation plan before saving the change.',
          status: 400,
        },
      };
      const handled = mapped[reason];
      return NextResponse.json({ error: handled?.message || 'Unable to change the accommodation plan. No partial change was saved.' }, { status: handled?.status || 500 });
    }

    const { data: createdInvoice } = await client
      .from('recruitment_accommodation_invoices')
      .select('*')
      .eq('id', result.data.invoice_id)
      .maybeSingle();

    if (!createdInvoice) {
      return NextResponse.json({ error: 'The replacement accommodation invoice could not be loaded after the plan change. BIMED has been notified.' }, { status: 500 });
    }

    let issuedInvoice: any = null;
    let invoicePublicUrl: string | null = null;
    try {
      const issuance = await issueAccommodationInvoice({
        client,
        invoice: createdInvoice,
        staff,
        application,
        permit,
        actor: session.email,
        automatic: true,
      });
      issuedInvoice = issuance.invoice;
      invoicePublicUrl = issuance.publicUrl;
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_plan_change_invoice_auto_issue_failed', staff_id: staff.id, invoice_id: createdInvoice.id, reason: error instanceof Error ? error.message : String(error) }));
      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'billing',
        title: 'Accommodation plan changed',
        body: 'Your new accommodation plan was recorded, but BIMED billing could not issue the replacement invoice automatically. BIMED will review the billing request.',
        actionUrl: '/staff/permit',
      });
      return NextResponse.json({ error: 'Your accommodation plan was changed, but BIMED could not issue the replacement invoice automatically. Please refresh shortly or contact BIMED.' }, { status: 502 });
    }

    const { data: updatedPermit } = await client
      .from('recruitment_staff_permit_cases')
      .select('*')
      .eq('id', result.data.permit_id)
      .single();

    return NextResponse.json({
      permit: updatedPermit || permit,
      invoice: issuedInvoice
        ? { id: issuedInvoice.id, invoice_number: issuedInvoice.invoice_number, status: issuedInvoice.status }
        : { id: result.data.invoice_id, invoice_number: result.data.invoice_number, status: result.data.invoice_status },
      invoiceUrl: invoicePublicUrl,
      changed: true,
    }, { status: 200 });
  }

  if (action === 'request_shared_accommodation_match') {
    if (!['three_months_shared_2000', 'one_month_shared_625'].includes(body?.accommodation_plan)) {
      return NextResponse.json({ error: 'Select a shared accommodation plan first.' }, { status: 400 });
    }
    if (body?.acknowledged !== true) {
      return NextResponse.json({ error: 'Please confirm the shared accommodation terms before continuing.' }, { status: 400 });
    }
    let selection;
    try {
      selection = validateAccommodationSelection({
        plan: body.accommodation_plan,
        route: body.permit_submission_route,
        roleValue: application?.role_applied,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_ACCOMMODATION_SELECTION';
      const messages: Record<string, string> = {
        INVALID_ACCOMMODATION_PLAN: 'Select a shared accommodation plan.',
        INVALID_PERMIT_SUBMISSION_ROUTE: 'Select who will submit and pay the employment permit application.',
        UNSUPPORTED_RECRUITMENT_ROLE: 'Your recruitment role is not currently configured for an employment-permit route.',
      };
      return NextResponse.json({ error: messages[code] || 'The shared accommodation selection could not be validated.' }, { status: 400 });
    }
    let result: any;
    try {
      result = await client.rpc('bimed_request_shared_accommodation_match', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_terms_version: ACCOMMODATION_OPTIONS_TERMS_VERSION,
        p_accommodation_plan: selection.accommodation_plan,
        p_permit_submission_route: selection.permit_submission_route,
        p_permit_type: selection.permit_type,
        p_permit_fee_eur: selection.permit_fee_eur,
        p_permit_duration_months: selection.permit_duration_months,
        p_selection_snapshot: selection,
        p_partner_identifier: typeof body?.partner_identifier === 'string' ? body.partner_identifier.trim() : '',
        p_bill_to_email: application?.email || staff.email || '',
        p_invoice_number: makeInvoiceNumber(),
        p_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to record the shared accommodation request.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const mapped: Record<string, { message: string; status: number }> = {
        STAFF_NOT_FOUND: { message: 'Your BIMED staff record could not be found.', status: 404 },
        STAFF_NOT_ELIGIBLE_FOR_ACCOMMODATION: { message: 'Your BIMED accommodation workspace is not currently eligible for this request.', status: 409 },
        PERMIT_CASE_NOT_FOUND: { message: 'Your employment-permit case has not been initialized. BIMED needs to review the account.', status: 409 },
        SHARED_ACCOMMODATION_SELECTION_NOT_AVAILABLE: { message: 'The accommodation selection has already been recorded or has progressed beyond the shared-plan request stage. Refresh the page to see the current status.', status: 409 },
        SHARED_ACCOMMODATION_INVOICE_ALREADY_EXISTS: { message: 'An accommodation invoice already exists for this case. Refresh the page to continue with the existing arrangement.', status: 409 },
      };
      const handled = mapped[reason];
      console.error(JSON.stringify({ level: 'error', event: 'shared_accommodation_match_request_failed', staff_id: staff.id, reason }));
      return NextResponse.json({ error: handled?.message || 'Unable to record the shared accommodation request. No partial change was saved.' }, { status: handled?.status || 500 });
    }
    const { data: createdInvoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('id', result.data.invoice_id).maybeSingle();
    if (!createdInvoice) return NextResponse.json({ error: 'The shared accommodation invoice could not be loaded after the request was saved. BIMED has been notified.' }, { status: 500 });
    try {
      await issueAccommodationInvoice({ client, invoice: createdInvoice, staff, application, permit, actor: session.email, automatic: true });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'shared_accommodation_pending_invoice_issue_failed', staff_id: staff.id, invoice_id: createdInvoice.id, reason: error instanceof Error ? error.message : String(error) }));
      await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Shared accommodation request recorded', body: 'Your shared accommodation request was recorded, but BIMED billing could not issue the accommodation invoice automatically. The request is preserved for review.', actionUrl: '/staff/permit' });
      return NextResponse.json({ error: 'Your shared accommodation request was recorded, but BIMED could not issue the invoice automatically. BIMED will review the billing record.', recoveryAvailable: true }, { status: 502 });
    }
    await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Shared accommodation request received', body: 'Your shared accommodation plan has been recorded. BIMED will arrange or assign the eligible sharing partner. Your accommodation invoice is available in the portal.', actionUrl: '/staff/permit' });
    const { data: updatedPermit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', result.data.permit_id).single();
    const { data: issued } = await client.from('recruitment_accommodation_invoices').select('id,invoice_number,status,public_token').eq('id', createdInvoice.id).single();
    return NextResponse.json({ permit: updatedPermit || permit, invoice: issued || { id: createdInvoice.id, invoice_number: createdInvoice.invoice_number, status: createdInvoice.status }, invoiceUrl: issued ? `${appUrl()}/invoices/accommodation/${issued.public_token}` : null, sharedMatchPending: true }, { status: 201 });
  }
  if (action === 'acknowledge_shared_accommodation') {
    if (body?.acknowledged !== true) {
      return NextResponse.json({ error: 'Please confirm the shared accommodation terms before continuing.' }, { status: 400 });
    }
    const sharedPlans = new Set(['three_months_shared_2000', 'one_month_shared_625']);
    if (!sharedPlans.has(body?.accommodation_plan)) {
      return NextResponse.json({ error: 'Select a shared accommodation plan first.' }, { status: 400 });
    }
    if (!body?.partner_identifier || typeof body.partner_identifier !== 'string') {
      return NextResponse.json({ error: 'Enter the BIMED ID or BIMED email of the candidate you will share accommodation with.' }, { status: 400 });
    }
    if (currentInvoice || permit.accommodation_terms_acknowledged_at) {
      return NextResponse.json({ error: 'Your accommodation selection has already been recorded. Use the shared-plan linking option if your existing record is a legacy shared arrangement.' }, { status: 409 });
    }

    let selection;
    try {
      selection = validateAccommodationSelection({
        plan: body.accommodation_plan,
        route: body.permit_submission_route,
        roleValue: application?.role_applied,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_ACCOMMODATION_SELECTION';
      const messages: Record<string, string> = {
        INVALID_ACCOMMODATION_PLAN: 'Select a shared accommodation plan.',
        INVALID_PERMIT_SUBMISSION_ROUTE: 'Select who will submit and pay the employment permit application.',
        UNSUPPORTED_RECRUITMENT_ROLE: 'Your recruitment role is not currently configured for an employment-permit route.',
      };
      return NextResponse.json({ error: messages[code] || 'The shared accommodation and permit selections could not be validated.' }, { status: 400 });
    }

    let result: any;
    try {
      result = await client.rpc('bimed_acknowledge_shared_accommodation_options', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_terms_version: ACCOMMODATION_OPTIONS_TERMS_VERSION,
        p_accommodation_plan: selection.accommodation_plan,
        p_permit_submission_route: selection.permit_submission_route,
        p_permit_type: selection.permit_type,
        p_permit_fee_eur: selection.permit_fee_eur,
        p_permit_duration_months: selection.permit_duration_months,
        p_selection_snapshot: selection,
        p_partner_identifier: body.partner_identifier.trim(),
        p_primary_invoice_number: makeInvoiceNumber(),
        p_primary_public_token: makePublicToken(),
        p_partner_invoice_number: makeInvoiceNumber(),
        p_partner_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to create the shared accommodation arrangement.');
    } catch (error) {
      const reason = error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);
      const mapped: Record<string, { message: string; status: number }> = {
        SHARED_PARTNER_NOT_FOUND: { message: 'No BIMED candidate was found for that BIMED ID or BIMED email.', status: 404 },
        SHARED_PARTNER_CANNOT_BE_SELF: { message: 'You cannot select yourself as the accommodation-sharing candidate.', status: 400 },
        SHARED_PARTNER_ALREADY_HAS_ACCOMMODATION: { message: 'That candidate already has an accommodation arrangement or invoice and cannot be added to this shared plan.', status: 409 },
        SHARED_PARTNER_ALREADY_SHARED: { message: 'That candidate is already linked to another active shared accommodation arrangement.', status: 409 },
        SHARED_PARTNER_NOT_ELIGIBLE: { message: 'That candidate is not currently eligible for a shared accommodation arrangement.', status: 409 },
        SHARED_PARTNER_PERMIT_CASE_NOT_FOUND: { message: 'That candidate does not yet have an employment-permit case and cannot be added to the shared plan.', status: 409 },
        SHARED_ACCOMMODATION_SELECTION_NOT_AVAILABLE: { message: 'Your accommodation selection is already in progress or has advanced too far to start a shared arrangement.', status: 409 },
      };
      const handled = mapped[reason];
      console.error(JSON.stringify({ level: 'error', event: 'shared_accommodation_acknowledgement_atomic_failed', staff_id: staff.id, reason }));
      return NextResponse.json({ error: handled?.message || 'Unable to create the shared accommodation arrangement. No partial arrangement was saved.' }, { status: handled?.status || 500 });
    }

    const primaryInvoiceRow = (await client.from('recruitment_accommodation_invoices').select('*').eq('id', result.data.primary_invoice_id).single()).data;
    const partnerContext = await getPermitContext(result.data.partner_staff_id);

    if (!primaryInvoiceRow || !partnerContext.staff || !partnerContext.application || !partnerContext.permit || !partnerContext.invoice) {
      return NextResponse.json({ error: 'The shared accommodation records were created but could not be loaded for invoice issuance. BIMED has been notified.' }, { status: 500 });
    }

    let primaryIssuance: any;
    let partnerIssuance: any;
    try {
      primaryIssuance = await issueAccommodationInvoice({
        client,
        invoice: primaryInvoiceRow,
        staff,
        application,
        permit,
        actor: session.email,
        automatic: true,
      });
      partnerIssuance = await issueAccommodationInvoice({
        client,
        invoice: partnerContext.invoice,
        staff: partnerContext.staff,
        application: partnerContext.application,
        permit: partnerContext.permit,
        actor: session.email,
        automatic: true,
      });

      await createStaffNotification(client, {
        staffId: partnerContext.staff.id,
        category: 'billing',
        title: 'Shared accommodation arrangement linked',
        body: `${staff.full_name} (${staff.bimed_id}) selected you as the BIMED candidate sharing accommodation with them. Your invoice is €${Number(partnerIssuance.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR, which is your half of the shared accommodation arrangement. The arrangement reference is ${result.data.share_reference}.`,
        actionUrl: partnerIssuance.publicUrl ? `/invoices/accommodation/${partnerIssuance.invoice.public_token}` : '/staff/permit',
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ level: 'error', event: 'shared_accommodation_invoice_issue_failed', primary_staff_id: staff.id, partner_staff_id: result.data.partner_staff_id, reason }));
      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'billing',
        title: 'Shared accommodation billing needs recovery',
        body: 'The shared accommodation arrangement was saved, but one or more invoices could not be issued automatically. The arrangement is preserved and can be retried without creating duplicate invoices.',
        actionUrl: '/staff/permit',
      });
      if (partnerContext?.staff?.id) {
        await createStaffNotification(client, {
          staffId: partnerContext.staff.id,
          category: 'billing',
          title: 'Shared accommodation billing needs recovery',
          body: 'Your shared accommodation arrangement was saved, but one or more invoices could not be issued automatically. The arrangement is preserved and can be retried without creating duplicate invoices.',
          actionUrl: '/staff/permit',
        });
      }
      return NextResponse.json({ error: 'The shared arrangement was saved, but one or more invoices could not be issued automatically. The arrangement is preserved and can be retried without creating duplicate invoices.', recoveryAvailable: true }, { status: 502 });
    }

    const { data: updatedPermit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', permit.id).single();
    return NextResponse.json({
      permit: updatedPermit || permit,
      invoice: { id: primaryIssuance.invoice.id, invoice_number: primaryIssuance.invoice.invoice_number, status: primaryIssuance.invoice.status },
      invoiceUrl: primaryIssuance.publicUrl,
      shared: true,
      shareReference: result.data.share_reference,
      partner: { staffId: result.data.partner_staff_id, invoiceNumber: partnerIssuance.invoice.invoice_number, amountEur: partnerIssuance.invoice.amount_eur },
    }, { status: 201 });
  }

  if (action === 'link_existing_shared_accommodation_partner') {
    if (permit.cancellation_requested_at || permit.cancellation_finalized_at) {
      return NextResponse.json({ error: 'The shared accommodation arrangement cannot be linked while the sponsorship cancellation workflow is active or finalised.' }, { status: 409 });
    }
    if (!['three_months_shared_2000','one_month_shared_625'].includes(permit.accommodation_plan)
      || (permit.accommodation_share_role && permit.accommodation_share_role !== 'primary')) {
      return NextResponse.json({ error: 'This accommodation record is not a shared plan that can be linked.' }, { status: 409 });
    }
    if (permit.accommodation_share_id) {
      return NextResponse.json({ error: 'A sharing partner is already linked to this accommodation arrangement.' }, { status: 409 });
    }
    if (!body?.partner_identifier || typeof body.partner_identifier !== 'string') {
      return NextResponse.json({ error: 'Enter the BIMED ID or BIMED email of the candidate you will share accommodation with.' }, { status: 400 });
    }

    let result: any;
    try {
      result = await client.rpc('bimed_link_existing_shared_accommodation_partner', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_partner_identifier: body.partner_identifier.trim(),
        p_partner_invoice_number: makeInvoiceNumber(),
        p_partner_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to link the shared accommodation partner.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const mapped: Record<string, { message: string; status: number }> = {
        SHARED_PARTNER_NOT_FOUND: { message: 'No BIMED candidate was found for that BIMED ID or BIMED email.', status: 404 },
        SHARED_PARTNER_CANNOT_BE_SELF: { message: 'You cannot select yourself as the accommodation-sharing candidate.', status: 400 },
        SHARED_PARTNER_ALREADY_HAS_ACCOMMODATION: { message: 'That candidate already has an accommodation arrangement or invoice.', status: 409 },
        SHARED_PARTNER_ALREADY_SHARED: { message: 'That candidate is already linked to another shared accommodation arrangement.', status: 409 },
      };
      const handled = mapped[reason];
      return NextResponse.json({ error: handled?.message || 'Unable to link the shared accommodation partner. No partial link was saved.' }, { status: handled?.status || 500 });
    }

    const partnerContext = await getPermitContext(result.data.partner_staff_id);
    if (!partnerContext.staff || !partnerContext.application || !partnerContext.permit || !partnerContext.invoice) {
      return NextResponse.json({ error: 'The partner record was linked but the partner invoice could not be loaded.' }, { status: 500 });
    }

    try {
      const partnerIssuance = await issueAccommodationInvoice({
        client,
        invoice: partnerContext.invoice,
        staff: partnerContext.staff,
        application: partnerContext.application,
        permit: partnerContext.permit,
        actor: session.email,
        automatic: true,
      });
      await createStaffNotification(client, {
        staffId: partnerContext.staff.id,
        category: 'billing',
        title: 'Shared accommodation invoice issued',
        body: `${staff.full_name} (${staff.bimed_id}) linked you to their shared accommodation arrangement. Your invoice is €${Number(partnerIssuance.invoice.amount_eur).toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR.`,
        actionUrl: partnerIssuance.publicUrl ? `/invoices/accommodation/${partnerIssuance.invoice.public_token}` : '/staff/permit',
      });
      return NextResponse.json({ ok: true, shared: true, shareReference: result.data.share_reference, partnerInvoiceNumber: partnerIssuance.invoice.invoice_number }, { status: 201 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ level: 'error', event: 'shared_partner_invoice_issue_failed', staff_id: partnerContext.staff.id, reason }));
      await createStaffNotification(client, {
        staffId: staff.id,
        category: 'billing',
        title: 'Shared partner invoice needs recovery',
        body: 'The sharing partner was linked successfully, but the partner invoice could not be issued automatically. The arrangement is preserved and can be retried without creating a duplicate invoice.',
        actionUrl: '/staff/permit',
      });
      if (partnerContext.staff.id !== staff.id) {
        await createStaffNotification(client, {
          staffId: partnerContext.staff.id,
          category: 'billing',
          title: 'Shared accommodation billing needs recovery',
          body: 'Your shared accommodation invoice could not be issued automatically yet. The arrangement is preserved and can be retried without creating a duplicate invoice.',
          actionUrl: '/staff/permit',
        });
      }
      return NextResponse.json({ error: 'The partner was linked, but BIMED could not issue their invoice automatically. The arrangement is preserved and can be retried without creating a duplicate invoice.', recoveryAvailable: true }, { status: 502 });
    }
  }

  if (action === 'acknowledge_shared_accommodation_partner') {
    try {
      const result = await client.rpc('bimed_acknowledge_shared_accommodation_partner', {
        p_staff_id: staff.id,
        p_actor: session.email,
        p_terms_version: ACCOMMODATION_OPTIONS_TERMS_VERSION,
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to acknowledge the shared accommodation arrangement.');
      const { data: updatedPermit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', permit.id).single();
      return NextResponse.json({ ok: true, permit: updatedPermit || permit }, { status: 200 });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'shared_partner_acknowledgement_failed', staff_id: staff.id, reason: error instanceof Error ? error.message : String(error) }));
      return NextResponse.json({ error: 'Unable to acknowledge the shared accommodation arrangement.' }, { status: 500 });
    }
  }

  if (action === 'acknowledge_accommodation') {
    if (body?.acknowledged !== true) return NextResponse.json({ error: 'Please confirm that you understand and accept the selected accommodation, payment, refund and permit-route terms before continuing.' }, { status: 400 });
    if (body?.accommodation_plan === 'three_months_shared_2000' || body?.accommodation_plan === 'one_month_shared_625') {
      return NextResponse.json({ error: 'Shared accommodation plans must use the dedicated shared-accommodation workflow with a verified two-person accommodation partner.' }, { status: 400 });
    }
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
        p_invoice_description: selection.accommodation_plan === 'three_months_4000'
          ? 'BIMED-arranged accommodation for the initial three-month probationary period'
          : selection.accommodation_plan === 'one_month_shared_625'
            ? 'BIMED-arranged shared accommodation for the first month, including training, onboarding and shadow shifts'
            : 'BIMED-arranged accommodation for the first month, including training, onboarding and shadow shifts',
        p_invoice_notes: selection.refund_trigger === 'one_month_accommodation_expiry'
          ? `Refund trigger: the one-month accommodation arrangement expires. Refund processing follows the applicable accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`
          : `Refund trigger: successful three-month probationary period; refund in ${selection.accommodation_refund_installments} weekly instalments under the accommodation terms. Employment permit fee: €${selection.permit_fee_eur.toFixed(2)}. ${permitSubmissionLabel(selection.permit_submission_route)}.`,
        p_invoice_number: makeInvoiceNumber(),
        p_public_token: makePublicToken(),
        p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      });
      if (result.error || !result.data) throw result.error || new Error('Unable to record the accommodation acknowledgement.');
    } catch (error) {
      const reason = error instanceof Error
        ? error.message
        : error && typeof error === 'object'
          ? JSON.stringify(error)
          : String(error);
      console.error(JSON.stringify({ level: 'error', event: 'accommodation_acknowledgement_atomic_failed', staff_id: staff.id, reason }));
      return NextResponse.json({ error: 'Unable to record the accommodation acknowledgement. No partial acknowledgement was saved.' }, { status: 500 });
    }

    let issuedInvoice: any = null;
    let invoicePublicUrl: string | null = null;

    if (!result.data.already_acknowledged) {
      const { data: createdInvoice } = await client
        .from('recruitment_accommodation_invoices')
        .select('*')
        .eq('id', result.data.invoice_id)
        .maybeSingle();

      if (!createdInvoice) {
        return NextResponse.json({ error: 'The accommodation invoice record could not be loaded after the selection was saved. BIMED has been notified.' }, { status: 500 });
      }

      try {
        const issuance = await issueAccommodationInvoice({
          client,
          invoice: createdInvoice,
          staff,
          application,
          permit,
          actor: session.email,
          automatic: true,
        });
        issuedInvoice = issuance.invoice;
        invoicePublicUrl = issuance.publicUrl;
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'accommodation_invoice_auto_issue_failed', staff_id: staff.id, invoice_id: createdInvoice.id, reason: error instanceof Error ? error.message : String(error) }));
        await createStaffNotification(client, { staffId: staff.id, category: 'billing', title: 'Accommodation selection recorded', body: 'Your accommodation selection was recorded, but BIMED billing could not issue the invoice automatically. BIMED will review the billing request.', actionUrl: '/staff/permit' });
        return NextResponse.json({ error: 'Your accommodation selection was recorded, but BIMED could not issue the invoice automatically. Please refresh shortly or contact BIMED.' }, { status: 502 });
      }
    } else if (currentInvoice?.status === 'issued') {
      issuedInvoice = currentInvoice;
      invoicePublicUrl = `${appUrl()}/invoices/accommodation/${currentInvoice.public_token}`;
    }

    const { data: updatedPermit } = await client.from('recruitment_staff_permit_cases').select('*').eq('id', result.data.permit_id).single();
    return NextResponse.json({
      permit: updatedPermit || { id: result.data.permit_id },
      invoice: issuedInvoice
        ? { id: issuedInvoice.id, invoice_number: issuedInvoice.invoice_number, status: issuedInvoice.status }
        : { id: result.data.invoice_id, invoice_number: result.data.invoice_number, status: result.data.invoice_status },
      invoiceUrl: invoicePublicUrl,
      already_acknowledged: Boolean(result.data.already_acknowledged),
    }, { status: result.data.already_acknowledged ? 200 : 201 });
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
    if (permit.cancellation_finalized_at) return NextResponse.json({ error: 'The sponsorship journey has been closed following the accommodation-fee cancellation.' }, { status: 409 });
    if (permit.cancellation_requested_at && !permit.cancellation_revoked_at) return NextResponse.json({ error: `Your cancellation is pending until ${permit.cancellation_deadline_at}. Revoke it before the deadline to continue.` }, { status: 409 });
    if (!isAccommodationReady(currentInvoice)) return NextResponse.json({ error: 'Your accommodation invoice must be issued by BIMED before you can request BIMED to begin the employment-permit / sponsorship journey.' }, { status: 409 });
    const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
    if (!current.permit_submission_route || !current.permit_type) return NextResponse.json({ error: 'Select the employment-permit submission route before requesting permit assistance.' }, { status: 409 });
    if (['permit_granted','visa_granted','arrived','closed'].includes(current.status)) return NextResponse.json({ error: 'This permit journey has already progressed beyond the request stage.' }, { status: 409 });
    if (current.status === 'requested' || current.requested_at) return NextResponse.json({ permit: current, already_requested: true }, { status: 200 });
    const { data: updated, error } = await client.rpc('bimed_transition_staff_permit_status', {
      p_permit_case_id: current.id,
      p_actor: session.email,
      p_to_status: 'requested',
      p_note: 'Employment permit assistance requested by staff member.',
    });
    if (error || !updated) {
      const message = error?.message || 'Unable to submit the sponsorship request.';
      const status = message.includes('PERMIT_STATUS_TRANSITION_BLOCKED') ? 409 :
        message.includes('INVALID_PERMIT_STATUS') ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
    await createStaffNotification(client, { staffId: staff.id, category: 'permit', title: 'Employment permit assistance requested', body: `Your ${updated.permit_type === 'critical_skills_employment_permit' ? 'Critical Skills Employment Permit' : 'General Employment Permit'} route has been selected and your request has been received. BIMED will review your complete profile and prepare the relevant documentation.`, actionUrl: '/staff/permit' });
    return NextResponse.json({ permit: updated, already_requested: false }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unsupported permit action.' }, { status: 400 });
}
