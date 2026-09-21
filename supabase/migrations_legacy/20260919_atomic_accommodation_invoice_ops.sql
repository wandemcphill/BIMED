-- Make accommodation invoice issuance and cancellation atomic with the permit case.

begin;

create or replace function public.bimed_issue_accommodation_invoice(
  p_invoice_id uuid,
  p_actor text,
  p_due_date date,
  p_payment_account_snapshot jsonb
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
  v_now timestamptz := clock_timestamp();
  v_issue_date date := v_now::date;
  v_effective_due_date date := coalesce(p_due_date, (v_now + interval '7 days')::date);
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_INVOICE_ACTOR_REQUIRED';
  end if;

  select * into v_invoice
  from public.recruitment_accommodation_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where id = v_invoice.permit_case_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_PERMIT_CASE_NOT_FOUND';
  end if;

  select * into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id;

  if not found then
    raise exception 'ACCOMMODATION_STAFF_NOT_FOUND';
  end if;

  if v_invoice.status = 'issued' then
    return jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'permit', to_jsonb(v_permit),
      'already_issued', true
    );
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'ACCOMMODATION_INVOICE_NOT_ISSUABLE';
  end if;

  update public.recruitment_accommodation_invoices
  set status = 'issued',
      issue_date = v_issue_date,
      due_date = coalesce(v_invoice.due_date, v_effective_due_date),
      issued_at = v_now,
      payment_account_snapshot = coalesce(p_payment_account_snapshot, '{}'::jsonb),
      updated_at = v_now
  where id = v_invoice.id
  returning * into v_invoice;

  update public.recruitment_staff_permit_cases
  set accommodation_payment_status = 'invoice_issued',
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_staff.id,
    'accommodation_invoice_issued',
    p_actor,
    'accommodation_invoice_issued_atomic',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'amount_eur', v_invoice.amount_eur,
      'issued_at', v_now,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'permit', to_jsonb(v_permit),
    'already_issued', false
  );
end;
$$;

revoke all on function public.bimed_issue_accommodation_invoice(uuid,text,date,jsonb)
  from public, anon, authenticated;
grant execute on function public.bimed_issue_accommodation_invoice(uuid,text,date,jsonb)
  to service_role;


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
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_INVOICE_ACTOR_REQUIRED';
  end if;

  select * into v_invoice
  from public.recruitment_accommodation_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  if v_invoice.status not in ('issued','payment_reported','cancellation_requested') then
    raise exception 'ACCOMMODATION_INVOICE_NOT_CANCELABLE';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where id = v_invoice.permit_case_id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_PERMIT_CASE_NOT_FOUND';
  end if;

  select * into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id;

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
    'accommodation_invoice_cancelled_atomic',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'cancelled_at', v_now,
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

commit;
