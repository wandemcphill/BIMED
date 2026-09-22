-- Add the agreed €625 one-month shared accommodation plan and make it available
-- to both initial acknowledgement and the controlled unpaid-plan change flow.

begin;

alter table public.recruitment_staff_permit_cases
  drop constraint if exists recruitment_staff_permit_cases_accommodation_plan_check;

alter table public.recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_accommodation_plan_check
    check (accommodation_plan is null or accommodation_plan in ('three_months_4000','one_month_1250','one_month_shared_625'));

create or replace function public.bimed_acknowledge_staff_accommodation_options(
  p_staff_id uuid,
  p_actor text,
  p_terms_version text,
  p_accommodation_plan text,
  p_permit_submission_route text,
  p_permit_type text,
  p_amount_eur numeric,
  p_period_months integer,
  p_refund_trigger text,
  p_refund_installments integer,
  p_permit_duration_months integer,
  p_permit_fee_eur numeric,
  p_selection_snapshot jsonb,
  p_bill_to_email text,
  p_invoice_description text,
  p_invoice_notes text,
  p_invoice_number text,
  p_public_token text,
  p_due_date date
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
  v_application_role text;
  v_expected_permit_type text;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.application_id is null or v_staff.status <> 'pre_arrival' then
    raise exception 'STAFF_NOT_ELIGIBLE_FOR_ACCOMMODATION_ACK';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_staff.id
  for update;
  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  select a.role_applied into v_application_role
  from public.recruitment_applications a
  where a.id = v_staff.application_id;

  v_expected_permit_type := case
    when lower(trim(v_application_role)) = 'physiotherapist' then 'critical_skills_employment_permit'
    when lower(trim(v_application_role)) in ('healthcare assistant','senior support worker','support worker') then 'general_employment_permit'
    else null
  end;

  if v_expected_permit_type is null then raise exception 'UNSUPPORTED_RECRUITMENT_ROLE'; end if;
  if p_permit_type <> v_expected_permit_type then raise exception 'PERMIT_TYPE_MUST_MATCH_ROLE'; end if;
  if p_permit_submission_route not in ('candidate_or_agency','bimed_legal_team') then raise exception 'INVALID_PERMIT_SUBMISSION_ROUTE'; end if;
  if p_permit_fee_eur <> 1000 then raise exception 'INVALID_PERMIT_FEE'; end if;
  if p_permit_duration_months <> 24 then raise exception 'INVALID_PERMIT_DURATION'; end if;
  if p_refund_installments <> 4 then raise exception 'INVALID_REFUND_INSTALLMENTS'; end if;

  if p_accommodation_plan = 'three_months_4000' then
    if p_amount_eur <> 4000 or p_period_months <> 3 or p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_THREE_MONTH_ACCOMMODATION_SELECTION';
    end if;
  elsif p_accommodation_plan = 'one_month_1250' then
    if p_amount_eur <> 1250 or p_period_months <> 1 then
      raise exception 'INVALID_ONE_MONTH_ACCOMMODATION_SELECTION';
    end if;
    if p_permit_submission_route = 'bimed_legal_team' and p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_EMPLOYER_ROUTE_REFUND_TRIGGER';
    end if;
    if p_permit_submission_route = 'candidate_or_agency' and p_refund_trigger <> 'one_month_accommodation_expiry' then
      raise exception 'INVALID_SELF_ROUTE_REFUND_TRIGGER';
    end if;
  elsif p_accommodation_plan = 'one_month_shared_625' then
    if p_amount_eur <> 625 or p_period_months <> 1 then
      raise exception 'INVALID_SHARED_ACCOMMODATION_SELECTION';
    end if;
    if p_permit_submission_route = 'bimed_legal_team' and p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_EMPLOYER_ROUTE_REFUND_TRIGGER';
    end if;
    if p_permit_submission_route = 'candidate_or_agency' and p_refund_trigger <> 'one_month_accommodation_expiry' then
      raise exception 'INVALID_SELF_ROUTE_REFUND_TRIGGER';
    end if;
  else
    raise exception 'INVALID_ACCOMMODATION_PLAN';
  end if;

  select * into v_invoice
  from public.recruitment_accommodation_invoices
  where permit_case_id = v_permit.id
  for update;

  if v_permit.accommodation_terms_acknowledged_at is not null then
    if not found then raise exception 'ACCOMMODATION_INVOICE_MISSING_AFTER_ACK'; end if;
    return jsonb_build_object(
      'permit_id', v_permit.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_status', v_invoice.status,
      'already_acknowledged', true,
      'selection_snapshot', v_permit.accommodation_selection_snapshot
    );
  end if;

  if found then raise exception 'ACCOMMODATION_INVOICE_ALREADY_EXISTS_BEFORE_ACK'; end if;

  update public.recruitment_staff_permit_cases
  set accommodation_terms_acknowledged_at = v_now,
      accommodation_terms_version = p_terms_version,
      accommodation_terms_acknowledged_name = v_staff.full_name,
      accommodation_invoice_requested_at = v_now,
      accommodation_payment_status = 'invoice_requested',
      accommodation_offered = true,
      accommodation_plan = p_accommodation_plan,
      accommodation_period_months = p_period_months,
      accommodation_amount_eur = p_amount_eur,
      accommodation_refund_amount_eur = p_amount_eur,
      accommodation_refund_installments = p_refund_installments,
      accommodation_refund_trigger = p_refund_trigger,
      permit_submission_route = p_permit_submission_route,
      permit_type = p_permit_type,
      permit_fee_eur = p_permit_fee_eur,
      permit_duration_months = p_permit_duration_months,
      accommodation_selection_snapshot = p_selection_snapshot || jsonb_build_object('terms_version', p_terms_version, 'acknowledged_at', v_now),
      updated_at = v_now
  where id = v_permit.id;

  insert into public.recruitment_accommodation_invoices(
    permit_case_id, invoice_number, public_token, status, issue_date, due_date,
    amount_eur, currency, description, bill_to_name, bill_to_email, notes, arrangement_snapshot
  ) values (
    v_permit.id,
    p_invoice_number,
    p_public_token,
    'draft',
    v_now::date,
    p_due_date,
    p_amount_eur,
    'EUR',
    p_invoice_description,
    v_staff.full_name,
    nullif(btrim(p_bill_to_email), ''),
    p_invoice_notes,
    p_selection_snapshot || jsonb_build_object('terms_version', p_terms_version, 'acknowledged_at', v_now)
  )
  returning * into v_invoice;

  insert into public.recruitment_staff_audit_log(staff_id, actor, event_type, metadata)
  values (
    v_staff.id,
    p_actor,
    'accommodation_terms_acknowledged',
    jsonb_build_object(
      'terms_version', p_terms_version,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'accommodation_plan', p_accommodation_plan,
      'permit_submission_route', p_permit_submission_route,
      'permit_type', p_permit_type,
      'refund_trigger', p_refund_trigger,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'permit_id', v_permit.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status,
    'already_acknowledged', false,
    'selection_snapshot', p_selection_snapshot || jsonb_build_object('terms_version', p_terms_version, 'acknowledged_at', v_now)
  );
end;
$$;

revoke all on function public.bimed_acknowledge_staff_accommodation_options(uuid,text,text,text,text,text,numeric,integer,text,integer,integer,numeric,jsonb,text,text,text,text,text,date) from public, anon, authenticated;


create or replace function public.bimed_change_staff_accommodation_selection(
  p_staff_id uuid,
  p_actor text,
  p_terms_version text,
  p_accommodation_plan text,
  p_permit_submission_route text,
  p_permit_type text,
  p_amount_eur numeric,
  p_period_months integer,
  p_refund_trigger text,
  p_refund_installments integer,
  p_permit_duration_months integer,
  p_permit_fee_eur numeric,
  p_selection_snapshot jsonb,
  p_invoice_number text,
  p_public_token text,
  p_due_date date,
  p_invoice_description text,
  p_invoice_notes text
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
  v_application_role text;
  v_expected_permit_type text;
  v_previous_plan text;
  v_previous_amount numeric;
  v_previous_period integer;
  v_previous_route text;
  v_previous_invoice_number text;
  v_previous_public_token text;
  v_previous_snapshot jsonb;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_PLAN_CHANGE_ACTOR_REQUIRED';
  end if;

  if p_accommodation_plan not in ('three_months_4000','one_month_1250') then
    raise exception 'INVALID_ACCOMMODATION_PLAN';
  end if;

  if p_permit_submission_route not in ('candidate_or_agency','bimed_legal_team') then
    raise exception 'INVALID_PERMIT_SUBMISSION_ROUTE';
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

  select a.role_applied
    into v_application_role
  from public.recruitment_applications a
  where a.id = v_staff.application_id;

  v_expected_permit_type := case
    when lower(trim(v_application_role)) = 'physiotherapist' then 'critical_skills_employment_permit'
    when lower(trim(v_application_role)) in ('healthcare assistant','senior support worker','support worker') then 'general_employment_permit'
    else null
  end;

  if v_expected_permit_type is null then
    raise exception 'UNSUPPORTED_RECRUITMENT_ROLE';
  end if;

  if p_permit_type <> v_expected_permit_type then
    raise exception 'PERMIT_TYPE_MUST_MATCH_ROLE';
  end if;

  if p_permit_fee_eur <> 1000 then
    raise exception 'INVALID_PERMIT_FEE';
  end if;

  if p_permit_duration_months <> 24 then
    raise exception 'INVALID_PERMIT_DURATION';
  end if;

  if p_refund_installments <> 4 then
    raise exception 'INVALID_REFUND_INSTALLMENTS';
  end if;

  if p_accommodation_plan = 'three_months_4000' then
    if p_amount_eur <> 4000 or p_period_months <> 3 or p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_THREE_MONTH_ACCOMMODATION_SELECTION';
    end if;
  elsif p_accommodation_plan = 'one_month_1250' then
    if p_amount_eur <> 1250 or p_period_months <> 1 then
      raise exception 'INVALID_ONE_MONTH_ACCOMMODATION_SELECTION';
    end if;
    if p_permit_submission_route = 'bimed_legal_team' and p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_EMPLOYER_ROUTE_REFUND_TRIGGER';
    end if;
    if p_permit_submission_route = 'candidate_or_agency' and p_refund_trigger <> 'one_month_accommodation_expiry' then
      raise exception 'INVALID_SELF_ROUTE_REFUND_TRIGGER';
    end if;
  elsif p_accommodation_plan = 'one_month_shared_625' then
    if p_amount_eur <> 625 or p_period_months <> 1 then
      raise exception 'INVALID_SHARED_ACCOMMODATION_SELECTION';
    end if;
    if p_permit_submission_route = 'bimed_legal_team' and p_refund_trigger <> 'successful_three_month_probation' then
      raise exception 'INVALID_EMPLOYER_ROUTE_REFUND_TRIGGER';
    end if;
    if p_permit_submission_route = 'candidate_or_agency' and p_refund_trigger <> 'one_month_accommodation_expiry' then
      raise exception 'INVALID_SELF_ROUTE_REFUND_TRIGGER';
    end if;
  else
    raise exception 'INVALID_ACCOMMODATION_PLAN';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_staff.id
  for update;

  if not found then
    raise exception 'PERMIT_CASE_NOT_FOUND';
  end if;

  if v_permit.cancellation_requested_at is not null
     or v_permit.cancellation_finalized_at is not null
     or v_permit.status <> 'not_started'
     or v_permit.requested_at is not null then
    raise exception 'ACCOMMODATION_PLAN_CHANGE_NOT_ALLOWED';
  end if;

  if v_permit.accommodation_terms_acknowledged_at is null
     or v_permit.accommodation_plan is null then
    raise exception 'ACCOMMODATION_SELECTION_NOT_FOUND';
  end if;

  if v_permit.accommodation_plan = p_accommodation_plan then
    raise exception 'ACCOMMODATION_PLAN_NO_CHANGE';
  end if;

  select *
    into v_invoice
  from public.recruitment_accommodation_invoices
  where permit_case_id = v_permit.id
  for update;

  if not found then
    raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND';
  end if;

  if v_invoice.status not in ('draft','issued')
     or v_invoice.paid_at is not null
     or v_invoice.payment_reported_at is not null then
    raise exception 'ACCOMMODATION_PLAN_CHANGE_NOT_ALLOWED';
  end if;

  v_previous_plan := v_permit.accommodation_plan;
  v_previous_amount := v_permit.accommodation_amount_eur;
  v_previous_period := v_permit.accommodation_period_months;
  v_previous_route := v_permit.permit_submission_route;
  v_previous_invoice_number := v_invoice.invoice_number;
  v_previous_public_token := v_invoice.public_token;
  v_previous_snapshot := coalesce(v_permit.accommodation_selection_snapshot, '{}'::jsonb);

  v_snapshot := coalesce(p_selection_snapshot, '{}'::jsonb) || jsonb_build_object(
    'terms_version', p_terms_version,
    'acknowledged_at', v_now,
    'changed_from', jsonb_build_object(
      'accommodation_plan', v_previous_plan,
      'accommodation_amount_eur', v_previous_amount,
      'accommodation_period_months', v_previous_period,
      'permit_submission_route', v_previous_route,
      'invoice_number', v_previous_invoice_number,
      'public_token', v_previous_public_token
    ),
    'change_reason', 'Candidate changed unpaid accommodation plan before employment-permit request.'
  );

  update public.recruitment_accommodation_invoices
  set invoice_number = p_invoice_number,
      public_token = p_public_token,
      status = 'draft',
      issue_date = v_now::date,
      due_date = p_due_date,
      amount_eur = p_amount_eur,
      currency = 'EUR',
      description = p_invoice_description,
      notes = p_invoice_notes,
      issued_at = null,
      sent_at = null,
      paid_at = null,
      payment_reference = null,
      payment_method = null,
      payment_reported_at = null,
      payment_reported_by = null,
      cancellation_requested_at = null,
      cancellation_requested_by = null,
      cancellation_reason = null,
      admin_action_at = v_now,
      admin_action_by = p_actor,
      arrangement_snapshot = v_snapshot,
      updated_at = v_now
  where id = v_invoice.id
  returning * into v_invoice;

  update public.recruitment_staff_permit_cases
  set accommodation_terms_acknowledged_at = v_now,
      accommodation_terms_version = p_terms_version,
      accommodation_terms_acknowledged_name = v_staff.full_name,
      accommodation_invoice_requested_at = v_now,
      accommodation_payment_status = 'invoice_requested',
      accommodation_offered = true,
      accommodation_plan = p_accommodation_plan,
      accommodation_period_months = p_period_months,
      accommodation_amount_eur = p_amount_eur,
      accommodation_refund_amount_eur = p_amount_eur,
      accommodation_refund_installments = p_refund_installments,
      accommodation_refund_installments_paid = 0,
      accommodation_refund_trigger = p_refund_trigger,
      permit_submission_route = p_permit_submission_route,
      permit_type = p_permit_type,
      permit_fee_eur = p_permit_fee_eur,
      permit_duration_months = p_permit_duration_months,
      accommodation_selection_snapshot = v_snapshot,
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
    'accommodation_plan_changed',
    p_actor,
    'accommodation_plan_changed',
    jsonb_build_object(
      'previous_plan', v_previous_plan,
      'previous_amount_eur', v_previous_amount,
      'previous_period_months', v_previous_period,
      'new_plan', p_accommodation_plan,
      'new_amount_eur', p_amount_eur,
      'new_period_months', p_period_months,
      'permit_submission_route', p_permit_submission_route,
      'previous_invoice_number', v_previous_invoice_number,
      'replacement_invoice_number', v_invoice.invoice_number,
      'previous_snapshot', v_previous_snapshot,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'permit_id', v_permit.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status,
    'changed', true
  );
end;
$$;

revoke all on function public.bimed_change_staff_accommodation_selection(
  uuid,text,text,text,text,text,numeric,integer,text,integer,integer,numeric,jsonb,text,text,date,text,text
) from public, anon, authenticated;

grant execute on function public.bimed_change_staff_accommodation_selection(
  uuid,text,text,text,text,text,numeric,integer,text,integer,integer,numeric,jsonb,text,text,date,text,text
) to service_role;

commit;


commit;
