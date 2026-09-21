-- Close the remaining accommodation billing lifecycle mutation gaps.
--
-- Invoice cancellation and legacy receipt issuance must reconcile invoice/permit
-- state atomically. Email remains an external side effect after the transaction.

begin;

create or replace function public.bimed_cancel_accommodation_invoice(
  p_invoice_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_previous_invoice_status text;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_CANCEL_ACTOR_REQUIRED';
  end if;

  select *
    into v_invoice
  from public.recruitment_accommodation_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  if v_invoice.status not in ('issued', 'payment_reported', 'cancellation_requested') then
    raise exception 'ACCOMMODATION_INVOICE_NOT_CANCELABLE';
  end if;

  v_previous_invoice_status := v_invoice.status;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = v_invoice.permit_case_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_PERMIT_CASE_NOT_FOUND';
  end if;

  select *
    into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_STAFF_NOT_FOUND';
  end if;

  update public.recruitment_accommodation_invoices
  set status = 'cancelled',
      admin_action_at = v_now,
      admin_action_by = p_actor,
      updated_at = v_now
  where id = v_invoice.id
  returning * into v_invoice;

  update public.recruitment_staff_permit_cases
  set accommodation_payment_status = 'cancelled',
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_staff.id,
    'accommodation_invoice_cancelled',
    p_actor,
    'accommodation_invoice_cancelled',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'previous_invoice_status', v_previous_invoice_status,
      'permit_id', v_permit.id,
      'accommodation_payment_status', v_permit.accommodation_payment_status,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'permit', to_jsonb(v_permit)
  );
end;
$$;

revoke all on function public.bimed_cancel_accommodation_invoice(uuid,text)
  from public, anon, authenticated;
grant execute on function public.bimed_cancel_accommodation_invoice(uuid,text)
  to service_role;


create or replace function public.bimed_issue_accommodation_receipt(
  p_invoice_id uuid,
  p_actor text,
  p_receipt_issued_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_receipt public.recruitment_accommodation_receipts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_receipt_number text;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_RECEIPT_ACTOR_REQUIRED';
  end if;

  if nullif(btrim(p_receipt_issued_by), '') is null then
    raise exception 'ACCOMMODATION_RECEIPT_ISSUER_REQUIRED';
  end if;

  select *
    into v_invoice
  from public.recruitment_accommodation_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  if v_invoice.status <> 'paid' then
    raise exception 'ACCOMMODATION_INVOICE_NOT_PAID';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = v_invoice.permit_case_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_PERMIT_CASE_NOT_FOUND';
  end if;

  select *
    into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_STAFF_NOT_FOUND';
  end if;

  select *
    into v_receipt
  from public.recruitment_accommodation_receipts
  where invoice_id = v_invoice.id
  for update;

  if found then
    update public.recruitment_staff_permit_cases
    set accommodation_payment_status = 'paid_receipted',
        accommodation_paid_at = coalesce(accommodation_paid_at, v_invoice.paid_at, v_now),
        updated_at = v_now
    where id = v_permit.id
    returning * into v_permit;

    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'receipt_id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number,
      'permit_id', v_permit.id,
      'staff_id', v_staff.id,
      'already_exists', true
    );
  end if;

  v_receipt_number := 'BIMED-RCP-' ||
    to_char(v_now at time zone 'UTC', 'YYYYMMDD') ||
    '-' ||
    upper(substr(md5(random()::text || v_invoice.id::text), 1, 6));

  insert into public.recruitment_accommodation_receipts(
    invoice_id,
    receipt_number,
    amount_eur,
    currency,
    paid_at,
    payment_reference,
    payment_method,
    issued_by,
    notes
  )
  values (
    v_invoice.id,
    v_receipt_number,
    v_invoice.amount_eur,
    v_invoice.currency,
    coalesce(v_invoice.paid_at, v_now),
    v_invoice.payment_reference,
    v_invoice.payment_method,
    p_receipt_issued_by,
    'Automatically issued upon payment confirmation. Authorised by ' || p_receipt_issued_by || '.'
  )
  returning * into v_receipt;

  update public.recruitment_staff_permit_cases
  set accommodation_payment_status = 'paid_receipted',
      accommodation_paid_at = coalesce(accommodation_paid_at, v_invoice.paid_at, v_now),
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values
    (
      v_staff.id,
      'accommodation_payment_receipt_issued',
      p_actor,
      'accommodation_payment_receipt_issued',
      jsonb_build_object(
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'receipt_number', v_receipt.receipt_number,
        'atomic_workflow', true
      )
    );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'permit_id', v_permit.id,
    'staff_id', v_staff.id,
    'already_exists', false
  );
end;
$$;

revoke all on function public.bimed_issue_accommodation_receipt(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_issue_accommodation_receipt(uuid,text,text)
  to service_role;

commit;
