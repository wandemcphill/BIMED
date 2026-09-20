import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { dispatchArrivalTransfer } from '@/lib/arrival-transfer';

function buildPacket(staff: any, application: any, permit: any) {
  return {
    employee: {
      bimed_id: staff.bimed_id, full_name: staff.full_name, preferred_name: staff.preferred_name, portal_email: staff.email, personal_email: application?.email || null,
      phone: staff.phone, date_of_birth: staff.date_of_birth, nationality: staff.nationality,
      address: [staff.address_line_1, staff.address_line_2, staff.city, staff.county, staff.eircode, staff.country].filter(Boolean).join(', '),
    },
    employment: {
      employer: 'Bimed Healthcare Limited', role: staff.job_title || staff.role, employment_type: staff.employment_type, start_date: staff.employment_start_date,
      manager: staff.manager_name, primary_location: staff.primary_location, role_applied: application?.role_applied || staff.role,
      salary_eur: application?.role_applied ? ({ 'Support Worker': 36000, 'Healthcare Assistant': 36000, 'Senior Support Worker': 41000, Physiotherapist: 55000 } as Record<string, number>)[application.role_applied] || null : null,
    },
    immigration: {
      living_in_ireland: application?.living_in_ireland, country_of_residence: application?.country_of_residence, work_permission: application?.work_permission,
      pathway: permit.pathway, status: permit.status, permit_type: permit.permit_type, permit_application_id: permit.permit_application_id,
      visa_status: permit.visa_status, visa_application_reference: permit.visa_application_reference,
    },
    accommodation: {
      offered: permit.accommodation_offered, period_months: permit.accommodation_period_months, amount_eur: permit.accommodation_amount_eur,
      start_date: permit.accommodation_start_date, end_date: permit.accommodation_end_date, payment_status: permit.accommodation_payment_status,
      refund_amount_eur: permit.accommodation_refund_amount_eur, refund_installments: permit.accommodation_refund_installments,
      refund_installments_paid: permit.accommodation_refund_installments_paid, refund_status: permit.accommodation_refund_status,
    },
    readiness_notes: [
      'Confirm role and salary against the current DETE employment permit criteria.', 'Confirm whether a Labour Market Needs Test is required before submission.',
      'Confirm signed contract, qualifications and employer documentation are complete.', 'Attach the accommodation offer/agreement and clearly document its commercial terms.',
      'Keep applicant financial evidence separate from the employer accommodation evidence. Accommodation does not by itself replace any immigration financial requirement.',
    ],
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('*').eq('id', id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const permitResult = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle();
  const application = staff.application_id ? (await client.from('recruitment_applications').select('*').eq('id', staff.application_id).maybeSingle()).data : null;
  if (!permitResult.data) return NextResponse.json({ permit: null, packet: null, itinerary: null, transfer: null });
  const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', permitResult.data.id).maybeSingle();
  const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', permitResult.data.id).maybeSingle();
  return NextResponse.json({ permit: permitResult.data, packet: buildPacket(staff, application, permitResult.data), itinerary: itinerary || null, transfer: transfer || null });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('*').eq('id', id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });

  try {
    if (body.action === 'save_flight_booking') {
      const flightNumber = String(body.flight_number || '').trim();
      const arrivalAt = String(body.arrival_at || '').trim();
      const bookingReference = String(body.booking_reference || '').trim() || null;
      if (!flightNumber || !arrivalAt) return NextResponse.json({ error: 'Flight number and arrival time are required.' }, { status: 400 });
      if (Number.isNaN(new Date(arrivalAt).getTime())) return NextResponse.json({ error: 'Arrival time must be valid.' }, { status: 400 });
      try {
        const { data: result, error } = await client.rpc('bimed_confirm_staff_flight_booking', {
          p_permit_case_id: current.id,
          p_actor: session.email,
          p_flight_number: flightNumber,
          p_arrival_at: new Date(arrivalAt).toISOString(),
          p_booking_reference: bookingReference,
          p_airline: String(body.airline || '').trim() || null,
          p_booking_notes: String(body.booking_notes || '').trim() || null,
        });
        if (error || !result) {
          const message = error?.message || 'Unable to save the confirmed flight.';
          const code = message.includes('FLIGHT_BOOKING_CLEARANCE_REQUIRED') ? 409 : message.includes('TRAVEL_REQUEST_NOT_FOUND') ? 404 : 500;
          return NextResponse.json({ error: message }, { status: code });
        }
        const saved = result.itinerary;
        const transfer = result.transfer;
        await createStaffNotification(client, { staffId: id, category: 'travel', title: 'BIMED has booked your flight', body: `Your BIMED flight to Dublin has been booked. Flight ${flightNumber} arrives at ${new Date(saved.arrival_at).toLocaleString('en-IE')}. No fare information is displayed in the Staff Portal.`, actionUrl: '/staff/travel' });
        return NextResponse.json({ itinerary: saved, transfer: transfer || null });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save the confirmed flight.' }, { status: 500 });
      }
    }

    if (body.action === 'save_transfer') {
      const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
      if (!itinerary) return NextResponse.json({ error: 'Travel request not found.' }, { status: 404 });
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { permit_case_id: current.id, itinerary_id: itinerary.id, pickup_airport_code: 'DUB', destination_name: String(body.destination_name || 'BIMED accommodation').trim(), destination_address: String(body.destination_address || '').trim() || null, pickup_terminal: String(body.pickup_terminal || '').trim() || null, pickup_datetime: body.pickup_datetime ? new Date(String(body.pickup_datetime)).toISOString() : null, passenger_count: itinerary.passenger_count, passenger_names: itinerary.passengers, flight_number: itinerary.flight_number, flight_booking_reference: itinerary.booking_reference, flight_arrival_at: itinerary.arrival_at, special_instructions: String(body.special_instructions || '').trim() || null, status: itinerary.booking_status === 'booked' ? 'ready_to_dispatch' : 'pending_flight_booking', updated_at: now };
      const { data: transfer, error } = await client.from('recruitment_arrival_transfers').upsert(payload, { onConflict: 'permit_case_id' }).select('*').single();
      if (error || !transfer) return NextResponse.json({ error: 'Unable to save the airport pickup plan.' }, { status: 500 });
      await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'arrival_transfer_plan_updated', metadata: { supplier: transfer.supplier_name, destination_name: transfer.destination_name, destination_address_set: Boolean(transfer.destination_address), pickup_datetime: transfer.pickup_datetime } });
      return NextResponse.json({ transfer });
    }

    if (body.action === 'dispatch_pickup') {
      const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
      const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
      if (!itinerary || !transfer) return NextResponse.json({ error: 'Flight and airport pickup records must exist before dispatch.' }, { status: 404 });
      const updated = await dispatchArrivalTransfer({ client, staff, permit: current, itinerary, transfer, actor: session.email });
      await createStaffNotification(client, { staffId: id, category: 'travel', title: 'Airport pickup arranged', body: 'BIMED has sent your Dublin Airport pickup request to its transfer supplier. Driver details will appear in the Staff Portal when confirmed.', actionUrl: '/staff/travel' });
      return NextResponse.json({ transfer: updated });
    }

    if (body.action === 'update_pickup') {
      const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
      if (!transfer) return NextResponse.json({ error: 'Arrival transfer record not found.' }, { status: 404 });
      const status = String(body.status || transfer.status);
      const patch: Record<string, string> = {};
      for (const key of ['supplier_booking_reference','driver_name','driver_phone','vehicle_description','driver_meet_point','supplier_status_note']) {
        if (key in body) patch[key] = String(body[key] || '').trim();
      }
      if ('error' in body) patch.error = String(body.error || '').trim();

      const { data: updated, error } = await client.rpc('bimed_transition_arrival_transfer_status', {
        p_transfer_id: transfer.id,
        p_actor: session.email,
        p_to_status: status,
        p_patch: patch,
      });

      if (error || !updated) {
        const message = error?.message || 'Unable to update the pickup.';
        const code = message.includes('ARRIVAL_TRANSFER_STATUS_TRANSITION_BLOCKED') ||
          message.includes('ARRIVAL_TRANSFER_ITINERARY_REQUIRED') ? 409 :
          message.includes('INVALID_ARRIVAL_TRANSFER_STATUS') ? 400 :
          500;
        return NextResponse.json({ error: message }, { status: code });
      }

      if (['supplier_confirmed','driver_assigned','en_route'].includes(status)) {
        await createStaffNotification(client, {
          staffId: id,
          category: 'travel',
          title: 'Airport pickup updated',
          body: updated.driver_name
            ? `Pickup status: ${status.replaceAll('_',' ')}. Driver: ${updated.driver_name}${updated.driver_phone ? ` · ${updated.driver_phone}` : ''}.`
            : `Pickup status: ${status.replaceAll('_',' ')}.`,
          actionUrl: '/staff/travel',
        });
      }

      return NextResponse.json({ transfer: updated });
    }

    if (body.action === 'set_work_authorisation') {
      const verified = Boolean(body.work_authorised);
      try {
        const { data: permit, error } = await client.rpc('bimed_set_staff_work_authorisation', {
          p_permit_case_id: current.id,
          p_actor: session.email,
          p_work_authorised: verified,
          p_evidence_note: String(body.evidence_note || '').trim(),
        });
        if (error || !permit) {
          const message = error?.message || 'Unable to update work authorisation.';
          const status = message.includes('WORK_AUTHORISATION_STATUS_NOT_ELIGIBLE') || message.includes('WORK_AUTHORISATION_EVIDENCE_REQUIRED') ? 409 : 500;
          return NextResponse.json({ error: message }, { status });
        }
        const notice = permit.work_authorised
          ? 'BIMED has verified your right to work and enabled shift eligibility subject to normal rota requirements.'
          : 'BIMED has revoked work authorisation for this case. Shift eligibility is blocked until BIMED verifies permission again.';
        await createStaffNotification(client, { staffId: id, category: 'permit', title: 'Work authorisation updated', body: notice, actionUrl: '/staff/permit' });
        return NextResponse.json({ permit });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update work authorisation.' }, { status: 500 });
      }
    }

    if (body.status) {
      try {
        const { data: permit, error } = await client.rpc('bimed_transition_staff_permit_status', {
          p_permit_case_id: current.id,
          p_actor: session.email,
          p_to_status: String(body.status),
          p_note: typeof body.note === 'string' ? body.note.trim() || null : null,
        });
        if (error || !permit) {
          const message = error?.message || 'Unable to update permit journey.';
          const status = message.includes('PERMIT_STATUS_TRANSITION_BLOCKED') ? 409 :
            message.includes('INVALID_PERMIT_STATUS') ? 400 : 500;
          return NextResponse.json({ error: message }, { status });
        }
        await createStaffNotification(client, {
          staffId: id,
          category: 'permit',
          title: 'Employment permit journey updated',
          body: permit.work_authorised
            ? 'BIMED has updated your immigration/work-authorisation status. Your shift eligibility remains enabled subject to normal rota requirements.'
            : 'Your permit journey is now ' + permit.status + '. You are not permitted to take shifts until BIMED confirms that you have the required permission to work in Ireland.',
          actionUrl: '/staff/permit',
        });
        const { data: transferAfterTransition } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
        const { data: itineraryAfterTransition } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
        return NextResponse.json({ permit, itinerary: itineraryAfterTransition || null, transfer: transferAfterTransition || null });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update permit journey.' }, { status: 500 });
      }
    }

    const detailKeys = [
      'permit_type',
      'permit_application_id',
      'permit_refusal_reason',
      'visa_status',
      'visa_application_reference',
      'visa_refusal_reason',
      'notes',
    ] as const;
    const patch = Object.fromEntries(
      detailKeys
        .filter((key) => key in body)
        .map((key) => [key, body[key]]),
    );

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable permit details were supplied.' }, { status: 400 });
    }

    const { data: permit, error } = await client.rpc('bimed_update_staff_permit_details', {
      p_permit_case_id: current.id,
      p_actor: session.email,
      p_patch: patch,
    });
    if (error || !permit) {
      const message = error?.message || 'Unable to update permit case details.';
      const status = message.includes('STATUS_REQUIRED') || message.includes('STAGE_REQUIRED') ? 409 :
        message.includes('FIELD_NOT_ALLOWED') || message.includes('PATCH_REQUIRED') ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
    const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
    const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
    return NextResponse.json({ permit, itinerary: itinerary || null, transfer: transfer || null });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'overseas_case_action_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to complete the overseas case action.' }, { status: 500 });
  }
}
