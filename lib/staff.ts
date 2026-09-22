import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activationExpiresAt, createActivationToken, hashActivationToken } from './staff-auth';
import { BIMED_DEFAULT_END_DATE_ISO, BIMED_DEFAULT_START_DATE_ISO, recruitmentRoleSlug } from './bimed-role-policy';
import {
  ensureOnboardingChecklist,
  POST_ACCESS_CHECK_KEYS,
} from './onboarding-readiness';
import { generateBimedPortalEmail } from './staff-email';
import { ensureBimedStaffOnboardingPackage } from './staff-onboarding';

export const STAFF_PHOTO_BUCKET = 'bimed-staff-photos';

export type StaffStatus = 'pre_arrival' | 'active' | 'on_leave' | 'suspended' | 'former';

function asStaffProvisioningError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; details?: unknown };
    const message = typeof candidate.message === 'string' ? candidate.message.trim() : '';
    const details = typeof candidate.details === 'string' ? candidate.details.trim() : '';
    if (message) return new Error(details && details !== message ? message + ' — ' + details : message);
  }
  return new Error(fallback);
}

function defaultStartDate() {
  return BIMED_DEFAULT_START_DATE_ISO;
}

function mapResidentialAddress(address: string | null | undefined) {
  const value = address?.trim();
  if (!value) return {};
  return { address_line_1: value };
}

export function normalizeResidentialProfile(input: {
  address?: string | null;
  residenceCountry?: string | null;
  currentCountry?: string | null;
  livingInIreland?: string | null;
}) {
  const country =
    input.residenceCountry?.trim() ||
    (input.livingInIreland === 'No' ? input.currentCountry?.trim() : '') ||
    'Ireland';

  let address = input.address?.trim() || null;

  // International recruits sometimes have a stale country suffix copied into
  // the free-form address field. Correct only a trailing ", Ireland" when the
  // candidate's recorded country of residence is explicitly another country.
  if (address && country.toLowerCase() !== 'ireland') {
    address = address.replace(/,\s*ireland\s*$/i, ', ' + country);
  }

  return {
    address_line_1: address,
    country,
  };
}

export async function createStaffFromApplication(
  client: SupabaseClient,
  applicationId: string,
  options?: {
    refreshActivation?: boolean;
    lifecycle?: {
      toStatus: 'Onboarding' | 'Hired';
      actor: string;
      note?: string | null;
    };
  },
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
  if (signatureError) throw asStaffProvisioningError(signatureError, 'Unable to verify the signed employment contract.');

  const { data: externalContract, error: externalContractError } = await client
    .from('recruitment_external_contract_verifications')
    .select('id, role_slug, source, verified_by, verified_at, note')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (externalContractError) {
    throw asStaffProvisioningError(externalContractError, 'Unable to verify external contract evidence.');
  }

  if (signedContract && signedContract.role_slug !== expectedRoleSlug) {
    throw new Error('The signed contract role does not match the candidate\'s applied role.');
  }
  if (externalContract && externalContract.role_slug !== expectedRoleSlug) {
    throw new Error('The externally verified contract role does not match the candidate\'s applied role.');
  }
  if (!signedContract && !externalContract) {
    throw new Error('A signed BIMED contract or an administrator-verified externally signed contract is required before the candidate can be promoted to staff.');
  }

  const { data: existing } = await client
    .from('recruitment_staff')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (existing) {
    if (options?.lifecycle) {
      const activationToken = options.refreshActivation && !existing.activated_at ? createActivationToken() : null;
      const { data: promotedStaff, error: promotionError } = await client.rpc('bimed_promote_application_to_staff', {
        p_application_id: applicationId,
        p_to_status: options.lifecycle.toStatus,
        p_actor: options.lifecycle.actor,
        p_note: options.lifecycle.note || null,
        p_expected_role_slug: expectedRoleSlug,
        p_portal_email: null,
        p_activation_token_hash: activationToken ? hashActivationToken(activationToken) : null,
        p_activation_expires_at: activationToken ? activationExpiresAt() : null,
        p_refresh_activation: Boolean(activationToken),
        p_start_date: BIMED_DEFAULT_START_DATE_ISO,
        p_end_date: BIMED_DEFAULT_END_DATE_ISO,
      });
      if (promotionError || !promotedStaff) {
        throw asStaffProvisioningError(promotionError, 'Unable to atomically promote the staff profile.');
      }
      let provisioningWarning: string | null = null;
      try {
        await ensureBimedStaffOnboardingPackage(client, promotedStaff.id, application);
      } catch (error) {
        provisioningWarning = error instanceof Error ? error.message : 'Staff onboarding package could not be completed.';
        console.error(JSON.stringify({
          level: 'error',
          event: 'staff.post_promotion_enrichment_failed',
          application_id: applicationId,
          staff_id: promotedStaff.id,
          reason: provisioningWarning,
        }));
      }
      return { staff: promotedStaff, activationToken, provisioningWarning };
    }

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
      await ensureBimedStaffOnboardingPackage(client, refreshed.id, application);
      return { staff: refreshed, activationToken, provisioningWarning: null };
    }

    await ensureBimedStaffOnboardingPackage(client, existing.id, application);
    return { staff: existing, activationToken: null as string | null, provisioningWarning: null };
  }

  const activationToken = createActivationToken();
  const effectiveStartDate = defaultStartDate();
  const effectiveEndDate = BIMED_DEFAULT_END_DATE_ISO;
  const effectiveName = signedContract?.employee_name || application.full_name;
  const residentialProfile = normalizeResidentialProfile({
    address: signedContract?.employee_address || application.address,
    residenceCountry: application.country_of_residence,
    currentCountry: application.current_country,
    livingInIreland: application.living_in_ireland,
  });
  const effectiveAddress = residentialProfile.address_line_1 || application.address || null;
  const effectiveCountry = residentialProfile.country;
  const effectiveStatus: StaffStatus = application.living_in_ireland === 'No' ? 'pre_arrival' : 'active';
  const portalEmail = await generateBimedPortalEmail(client, effectiveName);

  let staff: any = null;

  if (options?.lifecycle) {
    const { data: promotedStaff, error: promotionError } = await client.rpc('bimed_promote_application_to_staff', {
      p_application_id: applicationId,
      p_to_status: options.lifecycle.toStatus,
      p_actor: options.lifecycle.actor,
      p_note: options.lifecycle.note || null,
      p_expected_role_slug: expectedRoleSlug,
      p_portal_email: portalEmail,
      p_activation_token_hash: hashActivationToken(activationToken),
      p_activation_expires_at: activationExpiresAt(),
      p_refresh_activation: false,
      p_start_date: effectiveStartDate,
      p_end_date: effectiveEndDate,
    });
    if (promotionError || !promotedStaff) {
      throw asStaffProvisioningError(promotionError, 'Unable to atomically promote the staff profile.');
    }

    // The atomic promotion RPC historically defaulted recruitment-linked staff
    // to Ireland. Reconcile the residential country/address from the application
    // immediately after promotion.
    const correctedResidentialProfile = normalizeResidentialProfile({
      address: signedContract?.employee_address || application.address,
      residenceCountry: application.country_of_residence,
      currentCountry: application.current_country,
      livingInIreland: application.living_in_ireland,
    });
    const { data: correctedStaff, error: residentialProfileError } = await client
      .from('recruitment_staff')
      .update({
        address_line_1: correctedResidentialProfile.address_line_1,
        country: correctedResidentialProfile.country,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promotedStaff.id)
      .select('*')
      .single();

    if (residentialProfileError || !correctedStaff) {
      throw asStaffProvisioningError(
        residentialProfileError,
        'Unable to reconcile the recruit residential address and country.'
      );
    }

    staff = correctedStaff;
  } else {
    const result = await client
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
        employment_end_date: effectiveEndDate,
        country: effectiveCountry,
        status: effectiveStatus,
        ...mapResidentialAddress(effectiveAddress),
        activation_token_hash: hashActivationToken(activationToken),
        activation_expires_at: activationExpiresAt(),
      })
      .select('*')
      .single();
    if (result.error || !result.data) throw result.error || new Error('Unable to create staff profile.');
    staff = result.data;
  }

  let provisioningWarning: string | null = null;
  try {
    await ensureOnboardingChecklist(client, application);
  } catch (error) {
    if (!options?.lifecycle) throw error;
    provisioningWarning = error instanceof Error ? error.message : 'Onboarding checklist could not be completed.';
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff.post_promotion_checklist_failed',
      application_id: applicationId,
      staff_id: staff.id,
      reason: provisioningWarning,
    }));
  }

  const now = new Date().toISOString();

  try {
    const { error: postAccessError } = await client
      .from('recruitment_onboarding_checklist')
      .update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
        notes: null,
        updated_at: now,
      })
      .eq('application_id', application.id)
      .in('item_key', Array.from(POST_ACCESS_CHECK_KEYS));
    if (postAccessError) throw postAccessError;
  } catch (error) {
    if (!options?.lifecycle) throw error;
    provisioningWarning = error instanceof Error ? error.message : 'Onboarding checklist state could not be finalized.';
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff.post_promotion_checklist_finalize_failed',
      application_id: applicationId,
      staff_id: staff.id,
      reason: provisioningWarning,
    }));
  }

  try {
    await ensureBimedStaffOnboardingPackage(client, staff.id, application);
  } catch (error) {
    if (!options?.lifecycle) throw error;
    provisioningWarning = error instanceof Error ? error.message : 'Staff onboarding package could not be completed.';
    console.error(JSON.stringify({
      level: 'error',
      event: 'staff.post_promotion_package_failed',
      application_id: applicationId,
      staff_id: staff.id,
      reason: provisioningWarning,
    }));
  }

  await client.from('recruitment_applications').update({
    bimed_id: staff.bimed_id,
    address: effectiveAddress,
    start_date: effectiveStartDate,
    updated_at: now,
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
      updated_at: now,
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

  return { staff, activationToken, provisioningWarning };
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
    action: input.eventType,
    actor: input.actor,
    event_type: input.eventType,
    metadata: input.metadata || {},
  });
}

export function hashOneTimePhotoName(staffId: string, originalName: string) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${staffId}/${crypto.createHash('sha256').update(`${staffId}:${safe}`).digest('hex').slice(0, 16)}-${Date.now()}-${safe}`;
}
