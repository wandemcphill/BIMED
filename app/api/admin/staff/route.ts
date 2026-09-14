import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit, createStaffFromApplication } from '@/lib/staff';
import { normalizeRecruitmentRole } from '@/lib/bimed-role-policy';

const INTERNAL_DEPARTMENTS = ['Administration', 'Finance', 'HR', 'Recruitment', 'Operations', 'Management', 'Other'] as const;
const EMPLOYMENT_TYPES = ['Permanent', 'Fixed-term', 'Part-time', 'Contract'] as const;
const INTERNAL_ROLE_LABEL = 'BIMED Staff';

function createBimedId() {
  return `BIM-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function createActivationUrl(request: NextRequest, token: string, email: string) {
  const origin = new URL(request.url).origin;
  return `${origin}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search')?.trim();

  let query = client
    .from('recruitment_staff')
    .select('id,bimed_id,status,full_name,preferred_name,email,phone,role,department,employment_type,employment_start_date,primary_location,pps_number,pps_status,tax_status,profile_photo_path,activated_at,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(250);
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,bimed_id.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load staff.' }, { status: 500 });

  return NextResponse.json({ staff: data || [] });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: {
    action?: string;
    applicationId?: string;
    staffId?: string;
    status?: string;
    fullName?: string;
    email?: string;
    phone?: string | null;
    jobTitle?: string;
    department?: string;
    employmentType?: string;
    startDate?: string | null;
    managerName?: string | null;
    address?: string | null;
    city?: string | null;
    county?: string | null;
    eircode?: string | null;
    country?: string | null;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const client = db();
  try {
    if (body.action === 'create_internal') {
      const fullName = body.fullName?.trim();
      const email = body.email?.trim().toLowerCase();
      const jobTitle = body.jobTitle?.trim();
      const department = body.department?.trim();
      const employmentType = body.employmentType?.trim();
      const startDate = body.startDate?.trim() || null;

      if (!fullName || !email || !jobTitle || !department || !employmentType) {
        return NextResponse.json({ error: 'Full name, email, job title, department and employment type are required.' }, { status: 400 });
      }
      if (!/^\s*[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+\s*$/.test(email)) {
        return NextResponse.json({ error: 'Enter a valid staff email address.' }, { status: 400 });
      }
      if (!INTERNAL_DEPARTMENTS.includes(department as (typeof INTERNAL_DEPARTMENTS)[number])) {
        return NextResponse.json({ error: 'Invalid BIMED department.' }, { status: 400 });
      }
      if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
        return NextResponse.json({ error: 'Invalid employment type.' }, { status: 400 });
      }
      if (normalizeRecruitmentRole(jobTitle)) {
        return NextResponse.json({ error: 'Care and clinical recruitment roles must be created from the recruitment workflow. Use this pathway only for internal BIMED staff.' }, { status: 400 });
      }
      if (startDate && Number.isNaN(new Date(`${startDate}T12:00:00Z`).getTime())) {
        return NextResponse.json({ error: 'Start date must be a valid date.' }, { status: 400 });
      }

      const { data: duplicate } = await client.from('recruitment_staff').select('id,bimed_id').eq('email', email).maybeSingle();
      if (duplicate) return NextResponse.json({ error: `A BIMED staff account already exists for ${email}.` }, { status: 409 });

      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const bimedId = createBimedId();

      const { data: staff, error } = await client
        .from('recruitment_staff')
        .insert({
          application_id: null,
          bimed_id: bimedId,
          status: 'active',
          full_name: fullName,
          email,
          phone: body.phone?.trim() || null,
          job_title: jobTitle,
          role: INTERNAL_ROLE_LABEL,
          employment_start_date: startDate,
          employment_type: employmentType,
          department,
          manager_name: body.managerName?.trim() || null,
          address_line_1: body.address?.trim() || null,
          city: body.city?.trim() || null,
          county: body.county?.trim() || null,
          eircode: body.eircode?.trim() || null,
          country: body.country?.trim() || 'Ireland',
          activation_token_hash: tokenHash,
          activation_expires_at: expires,
          auth_version: 1,
          session_version: 1,
        })
        .select('*')
        .single();

      if (error || !staff) throw error || new Error('Unable to create the BIMED staff account.');

      const activationUrl = createActivationUrl(request, token, staff.email);
      await createStaffAudit(client, {
        staffId: staff.id,
        actor: session.email,
        eventType: 'internal_staff_created',
        metadata: { department, job_title: jobTitle, employment_type: employmentType },
      });

      return NextResponse.json({ staff, activationUrl }, { status: 201 });
    }

    if (body.action === 'promote') {
      if (!body.applicationId) return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 });
      const result = await createStaffFromApplication(client, body.applicationId);
      await createStaffAudit(client, { staffId: result.staff.id, actor: session.email, eventType: 'staff_identity_created', metadata: { application_id: body.applicationId } });
      const activationUrl = result.activationToken ? createActivationUrl(request, result.activationToken, result.staff.email) : null;
      return NextResponse.json({ staff: result.staff, activationUrl });
    }

    if (body.action === 'status') {
      const allowed = ['pre_arrival', 'active', 'on_leave', 'suspended', 'former'];
      if (!body.staffId || !body.status || !allowed.includes(body.status)) return NextResponse.json({ error: 'Valid staffId and status are required.' }, { status: 400 });
      const { data, error } = await client.from('recruitment_staff').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.staffId).select('*').single();
      if (error || !data) return NextResponse.json({ error: 'Unable to update staff status.' }, { status: 500 });
      await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'staff_status_changed', metadata: { status: body.status } });
      return NextResponse.json({ staff: data });
    }

    if (body.action === 'rotate_activation') {
      if (!body.staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await client.from('recruitment_staff').update({ activation_token_hash: hash, activation_expires_at: expires, updated_at: new Date().toISOString() }).eq('id', body.staffId).select('id,email,bimed_id').single();
      if (error || !data) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
      await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'staff_activation_rotated' });
      const activationUrl = createActivationUrl(request, token, data.email);
      return NextResponse.json({ activationUrl });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff_admin_api_failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return NextResponse.json({ error: 'Unable to complete the staff action.' }, { status: 500 });
  }
}
