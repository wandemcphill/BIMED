import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import { createStaffAudit, createStaffNotification } from '@/lib/staff';

const numericFields = [
  'basicHours', 'overtimeHours', 'weekendHours', 'nightHours',
  'basicAmount', 'overtimeAmount', 'weekendAmount', 'nightAmount',
  'allowances', 'grossPay', 'paye', 'prsi', 'usc', 'otherDeductions', 'netPay',
] as const;

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const url = new URL(request.url);
  const staffId = url.searchParams.get('staffId');
  const client = db();
  let query = client.from('recruitment_staff_payslips').select('*,staff:recruitment_staff(id,bimed_id,full_name,preferred_name,role)').order('pay_period_end', { ascending: false }).limit(500);
  if (staffId) query = query.eq('staff_id', staffId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load payslips.' }, { status: 500 });
  return NextResponse.json({ payslips: data || [] });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: Record<string, any>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body.staffId || !body.payPeriodStart || !body.payPeriodEnd) return NextResponse.json({ error: 'staffId, payPeriodStart and payPeriodEnd are required.' }, { status: 400 });
  if (body.payPeriodEnd < body.payPeriodStart) return NextResponse.json({ error: 'Pay period end cannot be before the start date.' }, { status: 400 });

  for (const key of numericFields) {
    if (body[key] !== undefined && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) {
      return NextResponse.json({ error: `${key} must be a non-negative number.` }, { status: 400 });
    }
  }

  const grossPay = Number(body.grossPay || 0);
  const deductions = Number(body.paye || 0) + Number(body.prsi || 0) + Number(body.usc || 0) + Number(body.otherDeductions || 0);
  const netPay = Number(body.netPay || 0);
  if (Math.abs(grossPay - deductions - netPay) > 0.02) {
    return NextResponse.json({ error: 'Net pay must equal gross pay less PAYE, PRSI, USC and other deductions.' }, { status: 400 });
  }

  const client = db();
  const { data: staff, error: staffError } = await client.from('recruitment_staff').select('id,bimed_id,full_name,email,status').eq('id', body.staffId).maybeSingle();
  if (staffError || !staff) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });

  const payload = {
    staff_id: body.staffId,
    pay_period_start: body.payPeriodStart,
    pay_period_end: body.payPeriodEnd,
    payment_date: body.paymentDate || null,
    basic_hours: Number(body.basicHours || 0),
    overtime_hours: Number(body.overtimeHours || 0),
    weekend_hours: Number(body.weekendHours || 0),
    night_hours: Number(body.nightHours || 0),
    basic_amount: Number(body.basicAmount || 0),
    overtime_amount: Number(body.overtimeAmount || 0),
    weekend_amount: Number(body.weekendAmount || 0),
    night_amount: Number(body.nightAmount || 0),
    allowances: Number(body.allowances || 0),
    gross_pay: grossPay,
    paye: Number(body.paye || 0),
    prsi: Number(body.prsi || 0),
    usc: Number(body.usc || 0),
    other_deductions: Number(body.otherDeductions || 0),
    net_pay: netPay,
    currency: 'EUR',
    status: 'issued',
    notes: body.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client.from('recruitment_staff_payslips').upsert(payload, { onConflict: 'staff_id,pay_period_start,pay_period_end' }).select('*').single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to issue payslip.' }, { status: 500 });

  await createStaffNotification(client, { staffId: body.staffId, category: 'payroll', title: 'New payslip available', body: `Your BIMED payslip for ${body.payPeriodStart} to ${body.payPeriodEnd} is now available.`, actionUrl: '/staff' });
  await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'payslip_issued', metadata: { payslip_id: data.id, bimed_id: staff.bimed_id, pay_period_start: body.payPeriodStart, pay_period_end: body.payPeriodEnd } });
  return NextResponse.json({ payslip: data }, { status: 201 });
}
