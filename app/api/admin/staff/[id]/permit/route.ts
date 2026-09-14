import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

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
  if (!permitResult.data) return NextResponse.json({ permit: null, packet: null });
  return NextResponse.json({ permit: permitResult.data, packet: buildPacket(staff, application, permitResult.data) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,application_id').eq('id', id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
  const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['status','permit_type','permit_application_id','permit_decision','permit_refusal_reason','visa_status','visa_application_reference','visa_decision','visa_refusal_reason','accommodation_payment_status','accommodation_refund_status','accommodation_refund_amount_eur','accommodation_refund_installments_paid','accommodation_agreement_path','notes']) {
    if (key in body) update[key] = body[key];
  }
  if ('work_authorised' in body) {
    update.work_authorised = Boolean(body.work_authorised);
    update.shift_eligibility = body.work_authorised ? 'eligible' : 'blocked';
  }
  if (['permit_submitted','permit_granted','permit_refused'].includes(String(body.status))) update.permit_submitted_at = current.permit_submitted_at || new Date().toISOString();
  if (String(body.status) === 'permit_granted') update.permit_decision_at = new Date().toISOString();
  if (String(body.status) === 'permit_refused') update.permit_decision_at = new Date().toISOString();
  if (String(body.status) === 'visa_submitted') update.visa_submitted_at = current.visa_submitted_at || new Date().toISOString();
  if (['visa_granted','visa_refused'].includes(String(body.status))) update.visa_decision_at = new Date().toISOString();

  if (body.status === 'arrived' && body.work_authorised !== false) {
    update.work_authorised = true;
    update.shift_eligibility = 'eligible';
  }

  const { data: permit, error } = await client.from('recruitment_staff_permit_cases').update(update).eq('staff_id', id).select('*').single();
  if (error || !permit) return NextResponse.json({ error: 'Unable to update permit journey.' }, { status: 500 });

  if (body.status || 'work_authorised' in body) {
    const notice = permit.shift_eligibility === 'eligible'
      ? 'BIMED has updated your immigration/work-authorisation status. Your shift eligibility is now enabled subject to normal rota requirements.'
      : `Your permit journey is now ${permit.status}. You are not permitted to take shifts until BIMED confirms that you have the required permission to work in Ireland.`;
    await createStaffNotification(client, { staffId: id, category: 'permit', title: 'Employment permit journey updated', body: notice, actionUrl: '/staff/permit' });
    await createStaffAudit(client, { staffId: id, actor: session.email, eventType: 'employment_permit_case_updated', metadata: { status: permit.status, work_authorised: permit.work_authorised, shift_eligibility: permit.shift_eligibility } });
  }
  return NextResponse.json({ permit });
}
