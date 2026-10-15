-- Fix atomic accommodation payment recording after recruitment_staff_audit_log.action
-- became NOT NULL. The previous RPC omitted action from its insert column list,
-- causing "null value in column action" and rolling back Mark Paid in the admin UI.
-- Align the payable statuses with the admin route, which permits issued and
-- payment_reported invoices.

begin;

create or replace function public.bimed_record_accommodation_payment(
  p_invoice_id uuid,
  p_payment_reference text,
  p_payment_method text,
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
  v_payment_method text;
  v_payment_reference text;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_PAYMENT_ACTOR_REQUIRED';
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

  if v_invoice.status not in ('issued', 'payment_reported') then
    raise exception 'ACCOMMODATION_INVOICE_NOT_PAYABLE';
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
    raise exception 'ACCOMMODATION_RECEIPT_ALREADY_EXISTS';
  end if;

  v_payment_reference := nullif(btrim(p_payment_reference), '');
  v_payment_method := coalesce(nullif(btrim(p_payment_method), ''), 'Bank transfer');
  v_receipt_number := 'BIMED-RCP-' ||
    to_char(v_now at time zone 'UTC', 'YYYYMMDD') ||
    '-' ||
    upper(substr(md5(random()::text || v_invoice.id::text), 1, 6));

  update public.recruitment_accommodation_invoices
  set status = 'paid',
      paid_at = v_now,
      payment_reference = v_payment_reference,
      payment_method = v_payment_method,
      updated_at = v_now
  where id = v_invoice.id
  returning * into v_invoice;

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
    v_now,
    v_payment_reference,
    v_payment_method,
    p_receipt_issued_by,
    'Automatically issued upon payment confirmation. Authorised by ' || p_receipt_issued_by || '.'
  )
  returning * into v_receipt;

  update public.recruitment_staff_permit_cases
  set accommodation_payment_status = 'paid_receipted',
      accommodation_paid_at = v_now,
      updated_at = v_now
  where id = v_permit.id;

  insert into public.recruitment_staff_audit_log(
    staff_id,
    action,
    actor,
    event_type,
    metadata
  )
  values
    (
      v_staff.id,
      'accommodation_payment_recorded',
      p_actor,
      'accommodation_payment_recorded',
      jsonb_build_object(
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'payment_reference', v_receipt.payment_reference,
        'payment_method', v_receipt.payment_method,
        'receipt_number', v_receipt.receipt_number,
        'atomic_workflow', true
      )
    ),
    (
      v_staff.id,
      'accommodation_payment_receipt_issued',
      p_receipt_issued_by,
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
    'staff_id', v_staff.id
  );
end;
$$;

revoke all on function public.bimed_record_accommodation_payment(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bimed_record_accommodation_payment(uuid, text, text, text, text)
  to service_role;

commit;
