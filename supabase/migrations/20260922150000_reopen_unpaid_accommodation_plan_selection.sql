-- Allow an overseas candidate to change an unpaid accommodation plan safely.
-- The current invoice is voided and the accommodation selection is reopened.
-- Paid cases are deliberately locked.

create or replace function public.bimed_reset_staff_accommodation_selection(
  p_staff_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.recruitment_staff%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_now timestamptz := clock_timestamp();
  v_previous_plan text;
  v_previous_amount numeric;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_PLAN_CHANGE_ACTOR_REQUIRED';
  end if;

  select *
    into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if v_staff.application_id is null or v_staff.status <> 'pre_arrival' then
    raise exception 'STAFF_NOT_ELIGIBLE_FOR_ACCOMMODATION_PLAN_CHANGE';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_staff.id
  for update;

  if not found then
    raise exception 'PERMIT_CASE_NOT_FOUND';
  end if;

  select *
    into v_invoice
  from public.recruitment_accommodation_invoices
  where permit_case_id = v_permit.id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  if v_invoice.status = 'paid'
     or v_permit.accommodation_payment_status in ('paid', 'paid_receipted')
     or v_permit.accommodation_paid_at is not null then
    raise exception 'ACCOMMODATION_PLAN_CHANGE_LOCKED_PAID';
  end if;

  if v_invoice.status not in ('draft', 'issued') then
    raise exception 'ACCOMMODATION_INVOICE_NOT_CHANGEABLE';
  end if;

  v_previous_plan := v_permit.accommodation_plan;
  v_previous_amount := v_permit.accommodation_amount_eur;

  update public.recruitment_accommodation_invoices
  set status = 'cancelled',
      updated_at = v_now
  where id = v_invoice.id;

  update public.recruitment_staff_permit_cases
  set accommodation_terms_acknowledged_at = null,
      accommodation_terms_version = null,
      accommodation_terms_acknowledged_name = null,
      accommodation_invoice_requested_at = null,
      accommodation_payment_status = 'not_due',
      accommodation_paid_at = null,
      accommodation_plan = null,
      accommodation_refund_trigger = null,
      accommodation_period_months = null,
      accommodation_amount_eur = null,
      accommodation_refund_amount_eur = null,
      accommodation_refund_installments = null,
      permit_submission_route = null,
      permit_type = null,
      permit_fee_eur = null,
      permit_duration_months = null,
      accommodation_selection_snapshot = '{}'::jsonb,
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id,
    action,
    actor,
    event_type,
    metadata
  )
  values (
    v_staff.id,
    'accommodation_selection_reopened',
    p_actor,
    'accommodation_selection_reopened',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'previous_plan', v_previous_plan,
      'previous_amount_eur', v_previous_amount,
      'new_selection_required', true
    )
  );

  return jsonb_build_object(
    'permit', to_jsonb(v_permit),
    'invoice_id', v_invoice.id,
    'previous_plan', v_previous_plan,
    'previous_amount_eur', v_previous_amount
  );
end;
$$;

revoke all on function public.bimed_reset_staff_accommodation_selection(uuid, text)
  from public, anon, authenticated;

grant execute on function public.bimed_reset_staff_accommodation_selection(uuid, text)
  to service_role;
