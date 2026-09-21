import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffAudit, createStaffFromApplication } from '@/lib/staff';
import { normalizeRecruitmentRole } from '@/lib/bimed-role-policy';
import { sendStaffPortalActivationEmail } from '@/lib/email/staff-activation';
import { restrictRecruitmentStaffPortal, reactivateRecruitmentStaffPortal } from '@/lib/staff-portal-workflow';

const INTERNAL_DEPARTMENTS = ['Administration', 'Finance', 'HR', 'Recruitment', 'Operations', 'Management', 'Other'] as const;
const EMPLOYMENT_TYPES = ['Permanent', 'Fixed-term', 'Part-time', 'Contract'] as const;
const INTERNAL_ROLE_LABEL = 'BIMED Staff';
const PROMOTION_STATUSES = ['Hired', 'Onboarding', 'Offer Issued', 'Documents Awaiting', 'Permit Processing', 'Visa/Immigration Processing'] as const;
function createBimedId() { return `BIM-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
function createActivationUrl(request: NextRequest, token: string, email: string) { return `${new URL(request.url).origin}/staff/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`; }
export async function GET(request: NextRequest) {
  const session = await getAdminSession(request); if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db(); const url = new URL(request.url); const status = url.searchParams.get('status'); const search = url.searchParams.get('search')?.trim(); const mode = url.searchParams.get('mode');
  if (mode === 'promotion_candidates') {
    const { data: applications, error } = await client.from('recruitment_applications').select('id,full_name,email,role_applied,status,living_in_ireland,country_of_residence,submitted_at,start_date,bimed_id').in('status', [...PROMOTION_STATUSES]).order('submitted_at', { ascending: false }).limit(250);
    if (error) return NextResponse.json({ error: 'Unable to load recruitment intakes.' }, { status: 500 });
    const ids = (applications || []).map((x) => x.id); const { data: existingStaff } = ids.length ? await client.from('recruitment_staff').select('application_id,bimed_id,status').in('application_id', ids) : { data: [] as any[] }; const byApplication = new Map((existingStaff || []).map((x) => [x.application_id, x]));
    return NextResponse.json({ candidates: (applications || []).map((application) => ({ ...application, already_staff: byApplication.has(application.id), staff: byApplication.get(application.id) || null })) });
  }
  let query = client.from('recruitment_staff').select('id,application_id,bimed_id,status,full_name,preferred_name,email,phone,role,department,employment_type,employment_start_date,primary_location,pps_number,pps_status,tax_status,profile_photo_path,activated_at,created_at,updated_at,department_namespace,portal_handle,portal_address,portal_restriction_reason,portal_restricted_at,portal_restricted_by,portal_restriction_message,portal_previous_status').order('created_at', { ascending: false }).limit(250);
  if (status) query = query.eq('status', status); if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,bimed_id.ilike.%${search}%`);
  const { data, error } = await query; if (error) return NextResponse.json({ error: 'Unable to load staff.' }, { status: 500 }); return NextResponse.json({ staff: data || [] });
}
export async function POST(request: NextRequest) {
  const session = await getAdminSession(request); if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const client = db();
  try {
    if (body.action === 'create_internal') {
      const fullName = body.fullName?.trim(); const email = body.email?.trim().toLowerCase(); const jobTitle = body.jobTitle?.trim(); const department = body.department?.trim(); const employmentType = body.employmentType?.trim(); const startDate = body.startDate?.trim() || null;
      if (!fullName || !email || !jobTitle || !department || !employmentType) return NextResponse.json({ error: 'Full name, email, job title, department and employment type are required.' }, { status: 400 }); if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid staff email address.' }, { status: 400 }); if (!INTERNAL_DEPARTMENTS.includes(department as any)) return NextResponse.json({ error: 'Invalid BIMED department.' }, { status: 400 }); if (!EMPLOYMENT_TYPES.includes(employmentType as any)) return NextResponse.json({ error: 'Invalid employment type.' }, { status: 400 }); if (normalizeRecruitmentRole(jobTitle)) return NextResponse.json({ error: 'Care and clinical roles must be created through the recruitment pathway.' }, { status: 400 });
      const { data: duplicate } = await client.from('recruitment_staff').select('id,bimed_id').eq('email', email).maybeSingle(); if (duplicate) return NextResponse.json({ error: `A BIMED staff account already exists for ${email}.` }, { status: 409 });
      const token = crypto.randomBytes(32).toString('base64url'); const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); const bimedId = createBimedId();
      const { data: staff, error } = await client.from('recruitment_staff').insert({ application_id: null, bimed_id: bimedId, status: 'active', full_name: fullName, email, phone: body.phone?.trim() || null, job_title: jobTitle, role: INTERNAL_ROLE_LABEL, employment_start_date: startDate, employment_type: employmentType, department, manager_name: body.managerName?.trim() || null, address_line_1: body.address?.trim() || null, city: body.city?.trim() || null, county: body.county?.trim() || null, eircode: body.eircode?.trim() || null, country: body.country?.trim() || 'Ireland', activation_token_hash: tokenHash, activation_expires_at: expires, auth_version: 1, session_version: 1 }).select('*').single(); if (error || !staff) throw error || new Error('Unable to create the BIMED staff account.'); await createStaffAudit(client, { staffId: staff.id, actor: session.email, eventType: 'internal_staff_created', metadata: { department, job_title: jobTitle, employment_type: employmentType } }); return NextResponse.json({ staff, activationUrl: createActivationUrl(request, token, staff.email) }, { status: 201 });
    }
    if (body.action === 'promote') {
      if (!body.applicationId) return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 });
      const result = await createStaffFromApplication(client, body.applicationId, {
        lifecycle: {
          toStatus: 'Onboarding',
          actor: session.email,
          note: 'Staff promotion initiated from Workforce Staff admin action.',
        },
      });
      await createStaffAudit(client, { staffId: result.staff.id, actor: session.email, eventType: 'staff_identity_created', metadata: { application_id: body.applicationId, lifecycle: 'Onboarding', atomic_workflow: true } });
      const activationUrl = result.activationToken ? createActivationUrl(request, result.activationToken, result.staff.email) : null;
      let welcomeEmailSent = false;
      if (result.activationToken) {
        const welcomeEmail = await sendStaffPortalActivationEmail(client, result.staff, result.activationToken);
        welcomeEmailSent = welcomeEmail.status === 'sent';
      }
      return NextResponse.json({ staff: result.staff, activationUrl, welcomeEmailSent, provisioningWarning: result.provisioningWarning || null });
    }
    if (body.action === 'status') {
      const allowed = ['pre_arrival', 'active', 'on_leave', 'suspended', 'former']; if (!body.staffId || !body.status || !allowed.includes(body.status)) return NextResponse.json({ error: 'Valid staffId and status are required.' }, { status: 400 });
      const { data: target } = await client.from('recruitment_staff').select('id,application_id,status,portal_restriction_reason').eq('id', body.staffId).maybeSingle(); if (!target) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
      if (target.application_id && body.status === 'suspended' && !['accommodation_nonpayment', 'sponsorship_cancellation'].includes(target.portal_restriction_reason || '')) return NextResponse.json({ error: 'Use the dedicated portal restriction workflow for recruitment-linked new recruits.' }, { status: 409 });
      if (target.portal_restriction_reason === 'accommodation_nonpayment' && body.status !== 'suspended') return NextResponse.json({ error: 'Use the Reactivate Staff Portal action to restore a recruit restricted for accommodation non-payment.' }, { status: 409 });
      if (target.portal_restriction_reason === 'sponsorship_cancellation' && body.status !== 'suspended') return NextResponse.json({ error: 'This account was restricted after a sponsorship cancellation was finalised and cannot be reactivated through the normal staff-status control.' }, { status: 409 });
      const { data, error } = await client.from('recruitment_staff').update({ status: body.status, updated_at: new Date().toISOString(), ...(body.status !== 'suspended' ? { session_version: crypto.randomInt(1, 2147483647) } : {}) }).eq('id', body.staffId).select('*').single(); if (error || !data) return NextResponse.json({ error: 'Unable to update staff status.' }, { status: 500 }); await createStaffAudit(client, { staffId: body.staffId, actor: session.email, eventType: 'staff_status_changed', metadata: { status: body.status } }); return NextResponse.json({ staff: data });
    }
    if (body.action === 'restrict_portal') {
      if (!body.staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });
      const { data: target } = await client.from('recruitment_staff').select('id,full_name,email,application_id,status,portal_restriction_reason').eq('id', body.staffId).maybeSingle(); if (!target) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 }); if (!target.application_id) return NextResponse.json({ error: 'Portal restriction for this workflow is limited to recruitment-linked new recruits.' }, { status: 400 });
      const { data: permitCase } = await client
        .from('recruitment_staff_permit_cases')
        .select('accommodation_plan,accommodation_amount_eur,accommodation_period_months')
        .eq('staff_id', target.id)
        .maybeSingle();
      const accommodationAmount = Number(permitCase?.accommodation_amount_eur || 0);
      const accommodationPeriod = Number(permitCase?.accommodation_period_months || 0);
      const accommodationPlanLabel =
        accommodationAmount === 1250 && accommodationPeriod === 1
          ? '€1,250 for 1 month'
          : accommodationAmount === 4000 && accommodationPeriod === 3
            ? '€4,000 for 3 months'
            : accommodationAmount > 0
              ? `€${accommodationAmount.toLocaleString('en-IE')} for ${accommodationPeriod || 'the agreed'} month${accommodationPeriod === 1 ? '' : 's'}`
              : 'the agreed accommodation plan';
      const message = `Your BIMED Staff Portal access has been temporarily restricted because the accommodation contribution under your agreed accommodation plan has not been resolved. BIMED accommodation arrangements are €4,000 for 3 months or €1,250 for 1 month, depending on the approved plan. Your recorded plan is ${accommodationPlanLabel}. Your employment contract remains on record, and your BIMED identity, recruitment information and other records have been retained. This restriction can be removed by BIMED once the accommodation payment requirement has been resolved. Please contact BIMED through the contact details previously provided if you need clarification.`;
      try { await restrictRecruitmentStaffPortal(client, target.id, session.email, message); } catch (error) { const messageError = error instanceof Error ? error.message : 'Unable to restrict portal access.'; if (messageError.includes('STAFF_ALREADY_SUSPENDED')) return NextResponse.json({ error: 'This recruit is already suspended. Use the Reactivate Staff Portal action if the accommodation restriction has been resolved.' }, { status: 409 }); if (messageError.includes('STAFF_NOT_RECRUITMENT_LINKED')) return NextResponse.json({ error: 'Portal restriction for this workflow is limited to recruitment-linked new recruits.' }, { status: 400 }); return NextResponse.json({ error: 'Unable to atomically restrict portal access and record the audit action.' }, { status: 500 }); }
      const { data } = await client.from('recruitment_staff').select('*').eq('id', target.id).single(); return NextResponse.json({ staff: data, message });
    }
    if (body.action === 'reactivate_portal') {
      if (!body.staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });
      const { data: target } = await client.from('recruitment_staff').select('id,status,portal_restriction_reason').eq('id', body.staffId).maybeSingle(); if (!target) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
      try { await reactivateRecruitmentStaffPortal(client, target.id, session.email); } catch (error) { const messageError = error instanceof Error ? error.message : 'Unable to reactivate portal access.'; if (messageError.includes('STAFF_NOT_ACCOMMODATION_RESTRICTED')) return NextResponse.json({ error: 'This staff record is not restricted by the accommodation non-payment workflow.' }, { status: 409 }); return NextResponse.json({ error: 'Unable to atomically reactivate portal access and record the audit action.' }, { status: 500 }); }
      const { data } = await client.from('recruitment_staff').select('*').eq('id', target.id).single(); return NextResponse.json({ staff: data, message: 'Portal access has been restored. The recruit can sign in again using the same BIMED ID, email and existing profile details.' });
    }
    if (body.action === 'rotate_activation') {
      if (!body.staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 });

      const { data: current, error: currentError } = await client
        .from('recruitment_staff')
        .select('id,email,bimed_id,application_id,full_name,preferred_name,job_title,role,employment_start_date,status,activation_token_hash,activation_expires_at,activated_at')
        .eq('id', body.staffId)
        .maybeSingle();

      if (currentError || !current) return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
      if (!['active', 'pre_arrival', 'on_leave'].includes(current.status)) {
        return NextResponse.json({ error: 'Activation can only be reissued for an eligible staff account.' }, { status: 409 });
      }
      if (current.activated_at) {
        return NextResponse.json({ error: 'This staff account has already been activated. The employee should sign in instead.' }, { status: 409 });
      }

      const { data: application, error: applicationError } = current.application_id
        ? await client.from('recruitment_applications').select('email').eq('id', current.application_id).maybeSingle()
        : { data: null, error: null };

      if (applicationError) return NextResponse.json({ error: 'Unable to identify the candidate recruitment email.' }, { status: 500 });

      const deliveryEmail = application?.email?.trim().toLowerCase() || current.email.trim().toLowerCase();
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const previousHash = current.activation_token_hash;
      const previousExpiry = current.activation_expires_at;

      const { error } = await client
        .from('recruitment_staff')
        .update({
          activation_token_hash: hash,
          activation_expires_at: expires,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.staffId);

      if (error) return NextResponse.json({ error: 'Unable to create a new activation link.' }, { status: 500 });

      let delivery;
      try {
        delivery = await sendStaffPortalActivationEmail(client, current, token, deliveryEmail, { mode: 'replacement' });
      } catch (sendError) {
        delivery = { status: 'failed', reason: sendError instanceof Error ? sendError.message : 'Unable to send activation email.' } as any;
      }

      if (delivery.status !== 'sent') {
        await client
          .from('recruitment_staff')
          .update({
            activation_token_hash: previousHash,
            activation_expires_at: previousExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.staffId)
          .eq('activation_token_hash', hash);

        return NextResponse.json(
          { error: 'The new activation link could not be emailed. The previous activation link remains unchanged.' },
          { status: 502 },
        );
      }

      await createStaffAudit(client, {
        staffId: body.staffId,
        actor: session.email,
        eventType: 'staff_activation_rotated',
        metadata: { delivery_email: deliveryEmail, automatic_email_sent: true, expiry: expires },
      });

      return NextResponse.json({
        activationUrl: createActivationUrl(request, token, current.email),
        welcomeEmailSent: true,
        message: 'A fresh seven-day activation link was generated and emailed to the recruitment email address.',
      });
    }
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) { console.error(JSON.stringify({ level: 'error', event: 'staff_admin_api_failed', reason: error instanceof Error ? error.message : 'unknown' })); return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to complete the staff action.' }, { status: 500 }); }
}
