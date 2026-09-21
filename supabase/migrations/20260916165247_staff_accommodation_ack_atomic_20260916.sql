-- Atomic staff accommodation acknowledgement + invoice creation.
-- Prevents a partial acknowledgement from surviving when invoice creation fails.

CREATE OR REPLACE FUNCTION public.bimed_acknowledge_staff_accommodation(
  p_staff_id uuid,
  p_actor text,
  p_terms_version text,
  p_amount_eur numeric,
  p_period_months integer,
  p_refund_installments integer,
  p_bill_to_email text,
  p_invoice_description text,
  p_invoice_notes text,
  p_invoice_number text,
  p_public_token text,
  p_due_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff public.recruitment_staff%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_now timestamptz := clock_timestamp();
  v_status text;
BEGIN
  SELECT * INTO v_staff
  FROM public.recruitment_staff
  WHERE id = p_staff_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  IF v_staff.application_id IS NULL OR v_staff.status <> 'pre_arrival' THEN
    RAISE EXCEPTION 'STAFF_NOT_ELIGIBLE_FOR_ACCOMMODATION_ACK';
  END IF;

  SELECT * INTO v_permit
  FROM public.recruitment_staff_permit_cases
  WHERE staff_id = v_staff.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERMIT_CASE_NOT_FOUND'; END IF;

  SELECT * INTO v_invoice
  FROM public.recruitment_accommodation_invoices
  WHERE permit_case_id = v_permit.id
  FOR UPDATE;

  IF v_permit.accommodation_terms_acknowledged_at IS NOT NULL THEN
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOMMODATION_INVOICE_MISSING_AFTER_ACK'; END IF;
    RETURN jsonb_build_object(
      'permit_id', v_permit.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_status', v_invoice.status,
      'already_acknowledged', true
    );
  END IF;

  IF FOUND THEN
    RAISE EXCEPTION 'ACCOMMODATION_INVOICE_ALREADY_EXISTS_BEFORE_ACK';
  END IF;

  v_status := 'draft';

  UPDATE public.recruitment_staff_permit_cases
  SET accommodation_terms_acknowledged_at = v_now,
      accommodation_terms_version = p_terms_version,
      accommodation_terms_acknowledged_name = v_staff.full_name,
      accommodation_invoice_requested_at = v_now,
      accommodation_payment_status = 'invoice_requested',
      updated_at = v_now
  WHERE id = v_permit.id;

  INSERT INTO public.recruitment_accommodation_invoices(
    permit_case_id, invoice_number, public_token, status, issue_date, due_date,
    amount_eur, currency, description, bill_to_name, bill_to_email, notes
  ) VALUES (
    v_permit.id,
    p_invoice_number,
    p_public_token,
    v_status,
    v_now::date,
    p_due_date,
    p_amount_eur,
    'EUR',
    p_invoice_description,
    v_staff.full_name,
    nullif(btrim(p_bill_to_email), ''),
    p_invoice_notes
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.recruitment_staff_audit_log(staff_id, actor, event_type, metadata)
  VALUES (
    v_staff.id,
    p_actor,
    'accommodation_terms_acknowledged',
    jsonb_build_object(
      'terms_version', p_terms_version,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'compulsory', true,
      'atomic_workflow', true
    )
  );

  RETURN jsonb_build_object(
    'permit_id', v_permit.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status,
    'already_acknowledged', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bimed_acknowledge_staff_accommodation(uuid,text,text,numeric,integer,integer,text,text,text,text,text,date) FROM public, anon, authenticated;
