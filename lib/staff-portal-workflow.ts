import type { SupabaseClient } from '@supabase/supabase-js';
import { sendStaffPortalAccessRestrictedEmail, sendStaffPortalAccessRestoredEmail } from '@/lib/email/staff-portal-access';

export async function restrictRecruitmentStaffPortal(client: SupabaseClient, staffId: string, actor: string, message: string) {
  const { data, error } = await client.rpc('bimed_restrict_staff_portal', { p_staff_id: staffId, p_actor: actor, p_message: message });
  if (error) throw new Error(error.message);

  const result = data as { staff_id: string; status: string; session_version: number };
  const { data: staff, error: staffError } = await client.from('recruitment_staff')
    .select('id,application_id,full_name,preferred_name,email,bimed_id')
    .eq('id', staffId)
    .single();

  if (staffError || !staff) {
    console.error(JSON.stringify({ level: 'error', event: 'staff_portal_restriction_email_lookup_failed', staff_id: staffId, reason: staffError?.message || 'staff record not found after restriction' }));
  } else {
    try {
      await sendStaffPortalAccessRestrictedEmail(client, staff, result.session_version, message);
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'staff_portal_restriction_email_dispatch_failed', staff_id: staffId, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
    }
  }

  return result;
}

export async function reactivateRecruitmentStaffPortal(client: SupabaseClient, staffId: string, actor: string) {
  const { data, error } = await client.rpc('bimed_reactivate_staff_portal', { p_staff_id: staffId, p_actor: actor });
  if (error) throw new Error(error.message);

  const result = data as { staff_id: string; status: string; session_version: number };
  const { data: staff, error: staffError } = await client.from('recruitment_staff')
    .select('id,application_id,full_name,preferred_name,email,bimed_id')
    .eq('id', staffId)
    .single();

  if (staffError || !staff) {
    console.error(JSON.stringify({ level: 'error', event: 'staff_portal_restoration_email_lookup_failed', staff_id: staffId, reason: staffError?.message || 'staff record not found after restoration' }));
  } else {
    try {
      await sendStaffPortalAccessRestoredEmail(client, staff, result.session_version);
    } catch (emailError) {
      console.error(JSON.stringify({ level: 'error', event: 'staff_portal_restoration_email_dispatch_failed', staff_id: staffId, reason: emailError instanceof Error ? emailError.message : String(emailError) }));
    }
  }

  return result;
}

export async function requestStaffSponsorshipCancellationAtomic(
  client: SupabaseClient,
  input: { staffId: string; actor: string; reason: string },
) {
  const { data, error } = await client.rpc('bimed_request_staff_sponsorship_cancellation', {
    p_staff_id: input.staffId,
    p_actor: input.actor,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data as {
    staff_id: string;
    permit_id: string;
    invoice_id: string;
    invoice_number: string;
    requested_at: string;
    deadline_at: string;
    already_requested: boolean;
  };
}

export async function revokeStaffSponsorshipCancellationAtomic(
  client: SupabaseClient,
  input: { staffId: string; actor: string },
) {
  const { data, error } = await client.rpc('bimed_revoke_staff_sponsorship_cancellation', {
    p_staff_id: input.staffId,
    p_actor: input.actor,
  });
  if (error) throw new Error(error.message);
  return data as {
    staff_id: string;
    permit_id: string;
    invoice_id: string;
    invoice_number: string;
    restored_invoice_status: string;
    deadline_passed: boolean;
  };
}

export async function recordAccommodationPaymentAtomic(
  client: SupabaseClient,
  input: { invoiceId: string; paymentReference: string | null; paymentMethod: string; actor: string; receiptIssuedBy: string },
) {
  const { data, error } = await client.rpc('bimed_record_accommodation_payment', {
    p_invoice_id: input.invoiceId,
    p_payment_reference: input.paymentReference,
    p_payment_method: input.paymentMethod,
    p_actor: input.actor,
    p_receipt_issued_by: input.receiptIssuedBy,
  });
  if (error) throw new Error(error.message);
  return data as { invoice_id: string; receipt_id: string; receipt_number: string; permit_id: string; staff_id: string };
}
