import { NextRequest, NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

const ALLOWED_STATUSES = new Set(['requested','admin_review','permit_preparation','permit_submitted','permit_granted','permit_refused','visa_preparation','visa_submitted','visa_granted','visa_refused','arrived','closed']);

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

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('*').eq('id', session.staff_id).maybeSingle();
  if (!staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  if (!staff.application_id || staff.status !== 'pre_arrival') return NextResponse.json({ error: 'The overseas permit workspace is only available to overseas recruitment-linked staff.' }, { status: 403 });

  const [{ data: permit }, { data: application }] = await Promise.all([
    client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle(),
    client.from('recruitment_applications').select('id,email,full_name,role_applied,country_of_residence,living_in_ireland,work_permission,start_date').eq('id', staff.application_id).maybeSingle(),
  ]);
  if (!permit) return NextResponse.json({ error: 'Permit case has not been initialized.' }, { status: 404 });
  return NextResponse.json({ permit, packet: completeProfilePacket(staff, application, permit) });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('*').eq('id', session.staff_id).maybeSingle();
  if (!staff || !staff.application_id || staff.status !== 'pre_arrival') return NextResponse.json({ error: 'The overseas permit workspace is only available to overseas recruitment-linked staff.' }, { status: 403 });
  const body = await request.json().catch(() => null) as any;
  const action = typeof body?.action === 'string' ? body.action : '';
  if (action !== 'request_sponsorship') return NextResponse.json({ error: 'Unsupported permit action.' }, { status: 400 });

  const { data: current } = await client.from('recruitment_staff_permit_cases').select('*').eq('staff_id', staff.id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Permit case not initialized.' }, { status: 404 });
  if (['permit_granted','visa_granted','arrived','closed'].includes(current.status)) return NextResponse.json({ error: 'This permit journey has already progressed beyond the request stage.' }, { status: 409 });

  const now = new Date().toISOString();
  const { data: updated, error } = await client.from('recruitment_staff_permit_cases').update({ status: 'requested', requested_at: current.requested_at || now, updated_at: now }).eq('staff_id', staff.id).select('*').single();
  if (error || !updated) return NextResponse.json({ error: 'Unable to submit the sponsorship request.' }, { status: 500 });

  await createStaffNotification(client, { staffId: staff.id, category: 'permit', title: 'Employment permit request submitted', body: 'Your request for BIMED to begin your employment permit / sponsorship journey has been received. BIMED will review your complete staff profile and prepare the employer-side documentation.', actionUrl: '/staff/permit' });
  await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'employment_permit_requested', metadata: { status: 'requested' } });
  return NextResponse.json({ permit: updated }, { status: 201 });
}
