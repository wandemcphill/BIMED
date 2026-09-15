import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activationExpiresAt, createActivationToken, hashActivationToken } from './staff-auth';
import { recruitmentRoleSlug } from './bimed-role-policy';
import { getOnboardingReadiness } from './onboarding-readiness';
import { generateBimedPortalEmail } from './staff-email';

export const STAFF_PHOTO_BUCKET = 'bimed-staff-photos';

export type StaffStatus = 'pre_arrival' | 'active' | 'on_leave' | 'suspended' | 'former';

function defaultStartDate() {
  return '2027-01-11';
}

function mapResidentialAddress(address: string | null | undefined) {
  const value = address?.trim();
  if (!value) return {};
  return { address_line_1: value };
}

export async function createStaffFromApplication(
  client: SupabaseClient,
  applicationId: string,
  options?: { refreshActivation?: boolean; allowUncontractedHire?: boolean },
) {
  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('*')
    .eq('id', applicationId)
    .single();
  if (applicationError || !application) throw new Error('Application not found.');

  const expectedRoleSlug = recruitmentRoleSlug(application.role_applied);
  if (!expectedRoleSlug) throw new Error('Application has an invalid recruitment role.');

  const { data: signedContract, error: signatureError } = await client
    .from('recruitment_contract_signatures')
    .select('id, role_slug, employee_name, employee_address, start_date, status, signed_at')
    .eq('application_id', applicationId)
    .eq('doc_type', 'contract')
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (signatureError) throw signatureError;
  if (signedContract && signedContract.role_slug !== expectedRoleSlug) {
    throw new Error('The signed contract role does not match the candidate\'s applied role.');
  }
  if (!signedContract && !options?.allowUncontractedHire) {
    throw new Error('The employment contract must be signed before the candidate can be promoted to staff.');
  }

  const { data: existing } = await client
    .from('recruitment_staff')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (existing) {
    if (application.bimed_id !== existing.bimed_id) {
      await client.from('recruitment_applications').update({ bimed_id: existing.bimed_id, updated_at: new Date().toISOString() }).eq('id', applicationId);
    }

    if (options?.refreshActivation && !existing.activated_at) {
      const activationToken = createActivationToken();
      const { data: refreshed, error: refreshError } = await client
        .from('recruitment_staff')
        .update({
          activation_token_hash: hashActivationToken(activationToken),
          activation_expires_at: activationExpiresAt(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (refreshError || !refreshed) throw refreshError || new Error('Unable to refresh the staff activation link.');
      return { staff: refreshed, activationToken };
    }

    return { staff: existing, activationToken: null as string | null };
  }

  if (!options?.allowUncontractedHire) {
    const readiness = await getOnboardingReadiness(client, application);
    if (!readiness.ready) {
      const missing = readiness.missing.map((item) => item.title).join(', ');
      throw new Error(`Onboarding is not complete. Complete the following before staff creation: ${missing}`);
    }
  }

  const activationToken = createActivationToken();
  const effectiveStartDate = defaultStartDate();
  const effectiveName = signedContract?.employee_name || application.full_name;
  const effectiveAddress = signedContract?.employee_address || application.address;
  const effectiveStatus: StaffStatus = application.living_in_ireland === 'No' ? 'pre_arrival' : 'active';
  const portalEmail = await generateBimedPortalEmail(client, effectiveName);

  const { data: staff, error } = await client
    .from('recruitment_staff')
    .insert({
      application_id: application.id,
      full_name: effectiveName,
      preferred_name: application.preferred_name,
      email: portalEmail,
      phone: application.phone,
      date_of_birth: application.date_of_birth,
      nationality: application.nationality,
      role: application.role_applied,
      job_title: application.role_applied,
      employment_type: application.employment_type,
      employment_start_date: effectiveStartDate,
      country: 'Ireland',
      status: effectiveStatus,
      ...mapResidentialAddress(effectiveAddress),
      activation_token_hash: hashActivationToken(activationToken),
      activation_expires_at: activationExpiresAt(),
    })
    .select('*')
    .single();
  if (error || !staff) throw error || new Error('Unable to create staff profile.');

  await client.from('recruitment_applications').update({
    bimed_id: staff.bimed_id,
    address: effectiveAddress,
    start_date: effectiveStartDate,
    updated_at: new Date().toISOString(),
  }).eq('id', applicationId);

  if (effectiveStatus === 'pre_arrival') {
    const { error: permitError } = await client.from('recruitment_staff_permit_cases').upsert({
      staff_id: staff.id,
      status: 'not_started',
      accommodation_offered: true,
      accommodation_period_months: 3,
      accommodation_amount_eur: 4000,
      accommodation_currency: 'EUR',
      accommodation_start_date: effectiveStartDate,
      accommodation_end_date: new Date(new Date(`${effectiveStartDate}T12:00:00Z`).setMonth(new Date(`${effectiveStartDate}T12:00:00Z`).getMonth() + 3)).toISOString().slice(0, 10),
      accommodation_refund_amount_eur: 4000,
      accommodation_refund_installments: 4,
      accommodation_refund_status: 'planned',
      accommodation_payment_status: 'not_due',
      work_authorised: false,
      shift_eligibility: 'blocked',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_id' });
    if (permitError) console.error(JSON.stringify({ level: 'error', event: 'staff.permit_case_init_failed', staff_id: staff.id, reason: permitError.message }));
  }

  await createStaffNotification(client, {
    staffId: staff.id,
    category: 'welcome',
    title: 'Welcome to the BIMED Staff Portal',
    body: `Your BIMED staff account is ready for your ${staff.job_title || staff.role || 'BIMED'} position. Your BIMED email is ${staff.email}. Sign in with your BIMED ID or BIMED email after activation. Use Messages to contact BIMED Admin / HR, My Rota for shifts and work requests, Attendance for attendance records, Payslips for payroll records, My Profile for your details and profile photograph, and Notifications for workplace updates.${staff.application_id ? ' Your recruitment-linked onboarding workspace remains available for follow-up requirements.' : ''}${effectiveStatus === 'pre_arrival' ? ' Your employment-permit and accommodation workspace is also available. You are not eligible to take shifts until the required permission to work is confirmed.' : ''}`,
    actionUrl: effectiveStatus === 'pre_arrival' ? '/staff/permit' : '/staff',
  });

  return { staff, activationToken };
}

export async function createStaffNotification(
  client: SupabaseClient,
  input: { staffId: string; category: string; title: string; body: string; actionUrl?: string | null },
) {
  const { data, error } = await client
    .from('recruitment_staff_notifications')
    .insert({
      staff_id: input.staffId,
      category: input.category,
      title: input.title,
      body: input.body,
      action_url: input.actionUrl || null,
    })
    .select('*')
    .single();
  if (error) {
    console.error(JSON.stringify({ level: 'error', event: 'staff_notification_failed', staff_id: input.staffId, category: input.category, reason: error.message }));
    return null;
  }
  return data;
}

export async function createStaffAudit(
  client: SupabaseClient,
  input: { staffId?: string | null; actor: string; eventType: string; metadata?: Record<string, unknown> },
) {
  await client.from('recruitment_staff_audit_log').insert({
    staff_id: input.staffId || null,
    actor: input.actor,
    event_type: input.eventType,
    metadata: input.metadata || {},
  });
}

export function hashOneTimePhotoName(staffId: string, originalName: string) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${staffId}/${crypto.createHash('sha256').update(`${staffId}:${safe}`).digest('hex').slice(0, 16)}-${Date.now()}-${safe}`;
}
