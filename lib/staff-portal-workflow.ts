import type { SupabaseClient } from '@supabase/supabase-js';

export async function restrictRecruitmentStaffPortal(client: SupabaseClient, staffId: string, actor: string, message: string) {
  const { data, error } = await client.rpc('bimed_restrict_staff_portal', { p_staff_id: staffId, p_actor: actor, p_message: message });
  if (error) throw new Error(error.message);
  return data;
}

export async function reactivateRecruitmentStaffPortal(client: SupabaseClient, staffId: string, actor: string) {
  const { data, error } = await client.rpc('bimed_reactivate_staff_portal', { p_staff_id: staffId, p_actor: actor });
  if (error) throw new Error(error.message);
  return data;
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
