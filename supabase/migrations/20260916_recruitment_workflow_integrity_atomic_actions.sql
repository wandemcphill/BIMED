-- Atomic recruitment workflow actions and lifecycle guardrails.
-- Applied to production before merging the application-layer changes.

CREATE OR REPLACE FUNCTION public.bimed_record_accommodation_payment(
  p_invoice_id uuid,
  p_payment_reference text,
  p_payment_method text,
  p_actor text,
  p_receipt_issued_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_receipt public.recruitment_accommodation_receipts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_receipt_number text;
BEGIN
  SELECT * INTO v_invoice FROM public.recruitment_accommodation_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOMMODATION_INVOICE_NOT_FOUND'; END IF;
  IF v_invoice.status <> 'issued' THEN RAISE EXCEPTION 'ACCOMMODATION_INVOICE_NOT_PAYABLE'; END IF;
  SELECT * INTO v_permit FROM public.recruitment_staff_permit_cases WHERE id = v_invoice.permit_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOMMODATION_PERMIT_CASE_NOT_FOUND'; END IF;
  SELECT * INTO v_staff FROM public.recruitment_staff WHERE id = v_permit.staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOMMODATION_STAFF_NOT_FOUND'; END IF;
  SELECT * INTO v_receipt FROM public.recruitment_accommodation_receipts WHERE invoice_id = v_invoice.id FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'ACCOMMODATION_RECEIPT_ALREADY_EXISTS'; END IF;
  v_receipt_number := 'BIMED-RCP-' || to_char(v_now AT TIME ZONE 'UTC','YYYYMMDD') || '-' || upper(substr(md5(random()::text || v_invoice.id::text),1,6));
  UPDATE public.recruitment_accommodation_invoices
    SET status='paid', paid_at=v_now, payment_reference=nullif(btrim(p_payment_reference), ''),
        payment_method=coalesce(nullif(btrim(p_payment_method), ''), 'Bank transfer'), updated_at=v_now
    WHERE id=v_invoice.id;
  INSERT INTO public.recruitment_accommodation_receipts(
    invoice_id, receipt_number, amount_eur, currency, paid_at, payment_reference,
    payment_method, issued_by, notes
  ) VALUES (
    v_invoice.id, v_receipt_number, v_invoice.amount_eur, v_invoice.currency, v_now,
    nullif(btrim(p_payment_reference), ''), coalesce(nullif(btrim(p_payment_method), ''), 'Bank transfer'),
    p_receipt_issued_by, 'Automatically issued upon payment confirmation. Authorised by ' || p_receipt_issued_by || '.'
  ) RETURNING * INTO v_receipt;
  UPDATE public.recruitment_staff_permit_cases
    SET accommodation_payment_status='paid_receipted', accommodation_paid_at=v_now, updated_at=v_now
    WHERE id=v_permit.id;
  INSERT INTO public.recruitment_staff_audit_log(staff_id, actor, event_type, metadata)
  VALUES
    (v_staff.id, p_actor, 'accommodation_payment_recorded', jsonb_build_object('invoice_number',v_invoice.invoice_number,'payment_reference',v_receipt.payment_reference,'payment_method',v_receipt.payment_method,'receipt_number',v_receipt.receipt_number,'atomic_workflow',true)),
    (v_staff.id, p_receipt_issued_by, 'accommodation_payment_receipt_issued', jsonb_build_object('invoice_number',v_invoice.invoice_number,'receipt_number',v_receipt.receipt_number,'atomic_workflow',true));
  RETURN jsonb_build_object('invoice_id',v_invoice.id,'receipt_id',v_receipt.id,'receipt_number',v_receipt.receipt_number,'permit_id',v_permit.id,'staff_id',v_staff.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.bimed_restrict_staff_portal(p_staff_id uuid, p_actor text, p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_staff public.recruitment_staff%rowtype; v_now timestamptz:=clock_timestamp(); v_new_version integer;
BEGIN
  SELECT * INTO v_staff FROM public.recruitment_staff WHERE id=p_staff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  IF v_staff.application_id IS NULL THEN RAISE EXCEPTION 'STAFF_NOT_RECRUITMENT_LINKED'; END IF;
  IF v_staff.status='suspended' THEN RAISE EXCEPTION 'STAFF_ALREADY_SUSPENDED'; END IF;
  v_new_version:=greatest(coalesce(v_staff.session_version,1)+1,2);
  UPDATE public.recruitment_staff SET status='suspended', portal_previous_status=v_staff.status,
    portal_restriction_reason='accommodation_nonpayment', portal_restricted_at=v_now,
    portal_restricted_by=p_actor, portal_restriction_message=p_message,
    session_version=v_new_version, updated_at=v_now WHERE id=p_staff_id;
  INSERT INTO public.recruitment_staff_audit_log(staff_id,actor,event_type,metadata)
    VALUES(p_staff_id,p_actor,'staff_portal_restricted',jsonb_build_object('reason','accommodation_nonpayment','previous_status',v_staff.status,'atomic_workflow',true));
  RETURN jsonb_build_object('staff_id',p_staff_id,'status','suspended','session_version',v_new_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.bimed_reactivate_staff_portal(p_staff_id uuid, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_staff public.recruitment_staff%rowtype; v_restored_status text; v_now timestamptz:=clock_timestamp(); v_new_version integer;
BEGIN
  SELECT * INTO v_staff FROM public.recruitment_staff WHERE id=p_staff_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  IF v_staff.status <> 'suspended' OR v_staff.portal_restriction_reason <> 'accommodation_nonpayment' THEN RAISE EXCEPTION 'STAFF_NOT_ACCOMMODATION_RESTRICTED'; END IF;
  v_restored_status:=CASE WHEN v_staff.portal_previous_status IN ('pre_arrival','active','on_leave') THEN v_staff.portal_previous_status ELSE 'pre_arrival' END;
  v_new_version:=greatest(coalesce(v_staff.session_version,1)+1,2);
  UPDATE public.recruitment_staff SET status=v_restored_status, portal_restriction_reason=null, portal_restricted_at=null,
    portal_restricted_by=null, portal_restriction_message=null, portal_previous_status=null,
    session_version=v_new_version, updated_at=v_now WHERE id=p_staff_id;
  INSERT INTO public.recruitment_staff_audit_log(staff_id,actor,event_type,metadata)
    VALUES(p_staff_id,p_actor,'staff_portal_reactivated',jsonb_build_object('restored_status',v_restored_status,'atomic_workflow',true));
  RETURN jsonb_build_object('staff_id',p_staff_id,'status',v_restored_status,'session_version',v_new_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_bimed_recruitment_staff_permit_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.application_id IS NOT NULL THEN
    INSERT INTO public.recruitment_staff_permit_cases(
      staff_id,status,accommodation_offered,accommodation_period_months,accommodation_amount_eur,
      accommodation_currency,accommodation_start_date,accommodation_end_date,accommodation_refund_amount_eur,
      accommodation_refund_installments,accommodation_refund_status,accommodation_payment_status,
      work_authorised,shift_eligibility,updated_at
    ) VALUES (
      NEW.id,'not_started',true,3,4000,'EUR',coalesce(NEW.employment_start_date,'2027-01-11'::date),
      (coalesce(NEW.employment_start_date,'2027-01-11'::date) + interval '3 months')::date,
      4000,4,'planned','not_due',false,'blocked',coalesce(NEW.updated_at,now())
    ) ON CONFLICT (staff_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_bimed_recruitment_staff_permit_case ON public.recruitment_staff;
CREATE TRIGGER trg_ensure_bimed_recruitment_staff_permit_case
AFTER INSERT ON public.recruitment_staff
FOR EACH ROW EXECUTE FUNCTION public.ensure_bimed_recruitment_staff_permit_case();

REVOKE ALL ON FUNCTION public.bimed_record_accommodation_payment(uuid,text,text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.bimed_restrict_staff_portal(uuid,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.bimed_reactivate_staff_portal(uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_bimed_recruitment_staff_permit_case() FROM public, anon, authenticated;
