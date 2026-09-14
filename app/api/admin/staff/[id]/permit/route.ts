import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';
import { dispatchArrivalTransfer } from '@/lib/arrival-transfer';

function buildPacket(staff: any, application: any, permit: any) {
  return {
    employee: {
      bimed_id: staff.bimed_id,
      full_name: staff.full_name,
      preferred_name: staff.preferred_name,
      portal_email: staff.email,
      personal_email: application?.email || null,
      phone: staff.phone,
      date_of_birth: staff.date_of_birth,
      nationality: staff.nationality,
      address: [staff.address_line_1, staff.address_line_2, staff.city, staff.county, staff.eircode, staff.country].filter(Boolean).join(', '),
    },
    employment: {
      employer: 'Bimed Healthcare Limited',
      role: staff.job_title || staff.role,
      employment_type: staff.employment_type,
      start_date: staff.employment_start_date,
      manager: staff.manager_name,
      primary_location: staff.primary_location,
      role_applied: application?.role_applied || staff.role,
      salary_eur: application?.role_applied ? ({ 'Support Worker': 36000, 'Healthcare Assistant': 36000, 'Senior Support Worker': 41000, Physiotherapist: 55000 } as Record<string, number>)[application.role_applied] || null : null,
    },
    immigration: {
      living_in_ireland: application?.living_in_ireland,
      country_of_residence: application?.country_of_residence,
      work_permission: application?.work_permission,
      pathway: permit.pathway,
      status: permit.status,
      permit_type: permit.permit_type,
      permit_application_id: permit.permit_application_id,
      visa_status: permit.visa_status,
      visa_application_reference: permit.visa_application_reference,
    },
    accommodation: {
      offered: permit.accommodation_offered,
      period_months: permit.accommodation_period_months,
      amount_eur: permit.accommodation_amount_eur,
      start_date: permit.accommodation_start_date,
      end_date: permit.accommodation_end_date,
      payment_status: permit.accommodation_payment_status,
      refund_amount_eur: permit.accommodation_refund_amount_eur,
      refund_installments: permit.accommodation_refund_installments,
      refund_installments_paid: permit.accommodation_refund_installments_paid,
      refund_status: permit.accommodation_refund_status,
    },
    readiness_notes: [
      'Confirm role and salary against the current DETE employment permit criteria.',
      'Confirm whether a Labour Market Needs Test is required before submission.',
      'Confirm signed contract, qualifications and employer documentation are complete.',
      'Attach the accommodation offer/agreement and clearly document its commercial terms.',
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
      const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
      if (!itinerary) return NextResponse.json({ error: 'Travel request not found.' }, { status: 404 });
      const flightNumber = String(body.flight_number || '').trim();
      const arrivalAt = String(body.arrival_at || '').trim();
      const bookingReference = String(body.booking_reference || '').trim() || null;
      if (!flightNumber || !arrivalAt) return NextResponse.json({ error: 'Flight number and arrival time are required.' }, { status: 400 });
      if (Number.isNaN(new Date(arrivalAt).getTime())) return NextResponse.json({ error: 'Arrival time must be valid.' }, { status: 400 });
      const now = new Date().toISOString();
      const { data: saved, error } = await client.from('recruitment_flight_itineraries').update({ booking_status: 'booked', status: 'booked', booking_reference: bookingReference, airline: String(body.airline || '').trim() || null, flight_number: flightNumber, arrival_at: new Date(arrivalAt).toISOString(), booked_at: now, booking_notes: String(body.booking_notes || '').trim() || null, updated_at: now }).eq('id', itinerary.id).select('*').single();
      if (error || !saved) return NextResponse.json({ error: 'Unable to save the confirmed flight.' }, { status: 500 });
      const { data: transfer } = await client.from('recruitment_arrival_transfers').upsert({ permit_case_id: current.id, itinerary_id: saved.id, status: 'ready_to_dispatch', pickup_airport_code: 'DUB', passenger_count: saved.passenger_count, passenger_names: saved.passengers, flight_number: flightNumber, flight_booking_reference: bookingReference, flight_arrival_at: saved.arrival_at, updated_at: now }, { onConflict: 'permit_case_id' }).select('*').single();
      await client.from('recruitment_staff_permit_cases').update({ flight_request_status: 'booked', flight_virtual_itinerary: { ...(current.flight_virtual_itinerary || {}), status: 'booked', flight_number: flightNumber, booking_reference: bookingReference, airline: saved.airline, arrival_at: saved.arrival_at }, flight_updated_at: now, updated_at: now }).eq('id', current.id);
      await createStaffNotification(client, { staffId: id, category: 'travel', title: 'BIMED has booked your flight', body: `Your BIMED flight to Dublin has been booked. Flight ${flightNumber} arrives at ${new Date(saved.arrival_at).toLocaleString('en-IE')}. No fare information is displayed in the Staff Portal.`, actionUrl: '/staff/travel' });
      await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'flight_booked_by_bimed', metadata: { flight_number: flightNumber, booking_reference: bookingReference, arrival_at: saved.arrival_at } });
      return NextResponse.json({ itinerary: saved, transfer: transfer || null });
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
      await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'arrival_transfer_supplier_dispatched', metadata: { supplier: updated.supplier_name, supplier_email: updated.supplier_email, status: updated.status } });
      return NextResponse.json({ transfer: updated });
    }

    if (body.action === 'update_pickup') {
      const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
      if (!transfer) return NextResponse.json({ error: 'Arrival transfer record not found.' }, { status: 404 });
      const allowed = ['pending_flight_booking','ready_to_dispatch','supplier_requested','supplier_confirmed','driver_assigned','en_route','arrived','completed','cancelled','failed'];
      const status = String(body.status || transfer.status);
      if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid pickup status.' }, { status: 400 });
      const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      for (const key of ['supplier_booking_reference','driver_name','driver_phone','vehicle_description','driver_meet_point','supplier_status_note']) if (key in body) update[key] = String(body[key] || '').trim() || null;
      if (status === 'supplier_confirmed' && !transfer.supplier_confirmed_at) update.supplier_confirmed_at = new Date().toISOString();
      if (status === 'completed' && !transfer.completed_at) update.completed_at = new Date().toISOString();
      if (status === 'cancelled' && !transfer.cancelled_at) update.cancelled_at = new Date().toISOString();
      const { data: updated, error } = await client.from('recruitment_arrival_transfers').update(update).eq('id', transfer.id).select('*').single();
      if (error || !updated) return NextResponse.json({ error: 'Unable to update the pickup.' }, { status: 500 });
      if (['supplier_confirmed','driver_assigned','en_route'].includes(status)) {
        await createStaffNotification(client, { staffId: id, category: 'travel', title: 'Airport pickup updated', body: updated.driver_name ? `Pickup status: ${status.replaceAll('_',' ')}. Driver: ${updated.driver_name}${updated.driver_phone ? ` · ${updated.driver_phone}` : ''}.` : `Pickup status: ${status.replaceAll('_',' ')}.`, actionUrl: '/staff/travel' });
      }
      await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'arrival_transfer_status_updated', metadata: { status, supplier_booking_reference: updated.supplier_booking_reference } });
      return NextResponse.json({ transfer: updated });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ['status','permit_type','permit_application_id','permit_decision','permit_refusal_reason','visa_status','visa_application_reference','visa_decision','visa_refusal_reason','accommodation_payment_status','accommodation_refund_status','accommodation_refund_amount_eur','accommodation_refund_installments_paid','accommodation_agreement_path','notes']) if (key in body) update[key] = body[key];
    if ('work_authorised' in body) { update.work_authorised = Boolean(body.work_authorised); update.shift_eligibility = body.work_authorised ? 'eligible' : 'blocked'; }
    if (['permit_submitted','permit_granted','permit_refused'].includes(String(body.status))) update.permit_submitted_at = current.permit_submitted_at || new Date().toISOString();
    if (['permit_granted','permit_refused'].includes(String(body.status))) update.permit_decision_at = new Date().toISOString();
    if (body.status === 'visa_submitted') update.visa_submitted_at = current.visa_submitted_at || new Date().toISOString();
    if (['visa_granted','visa_refused'].includes(String(body.status))) update.visa_decision_at = new Date().toISOString();
    if (body.status === 'arrived' && body.work_authorised !== false) { update.work_authorised = true; update.shift_eligibility = 'eligible'; }

    const { data: permit, error } = await client.from('recruitment_staff_permit_cases').update(update).eq('staff_id', id).select('*').single();
    if (error || !permit) return NextResponse.json({ error: 'Unable to update permit journey.' }, { status: 500 });

    if (body.status || 'work_authorised' in body) {
      const notice = permit.shift_eligibility === 'eligible' ? 'BIMED has updated your immigration/work-authorisation status. Your shift eligibility is now enabled subject to normal rota requirements.' : `Your permit journey is now ${permit.status}. You are not permitted to take shifts until BIMED confirms that you have the required permission to work in Ireland.`;
      await createStaffNotification(client, { staffId: id, category: 'permit', title: 'Employment permit journey updated', body: notice, actionUrl: '/staff/permit' });
      await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'employment_permit_case_updated', metadata: { status: permit.status, work_authorised: permit.work_authorised, shift_eligibility: permit.shift_eligibility } });
    }
    const { data: transfer } = await client.from('recruitment_arrival_transfers').select('*').eq('permit_case_id', current.id).maybeSingle();
    const { data: itinerary } = await client.from('recruitment_flight_itineraries').select('*').eq('permit_case_id', current.id).maybeSingle();
    return NextResponse.json({ permit, itinerary: itinerary || null, transfer: transfer || null });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'overseas_case_action_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to complete the overseas case action.' }, { status: 500 });
  }
}
