-- Atomically create a shared arrangement and both half-share invoices.

begin;
create or replace function public.bimed_acknowledge_shared_accommodation_options(
  p_staff_id uuid,
  p_actor text,
  p_terms_version text,
  p_accommodation_plan text,
  p_permit_submission_route text,
  p_permit_type text,
  p_permit_fee_eur numeric,
  p_permit_duration_months integer,
  p_selection_snapshot jsonb,
  p_partner_identifier text,
  p_primary_invoice_number text,
  p_primary_public_token text,
  p_partner_invoice_number text,
  p_partner_public_token text,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_staff public.recruitment_staff%rowtype;
  v_partner_staff public.recruitment_staff%rowtype;
  v_primary_permit public.recruitment_staff_permit_cases%rowtype;
  v_partner_permit public.recruitment_staff_permit_cases%rowtype;
  v_primary_application public.recruitment_applications%rowtype;
  v_partner_application public.recruitment_applications%rowtype;
  v_primary_selection jsonb;
  v_partner_selection jsonb;
  v_share_row public.recruitment_accommodation_shares%rowtype;
  v_primary_invoice public.recruitment_accommodation_invoices%rowtype;
  v_partner_invoice public.recruitment_accommodation_invoices%rowtype;
  v_partner_id uuid;
  v_total numeric;
  v_share_amount numeric;
  v_period integer;
  v_primary_trigger text;
  v_partner_trigger text;
  v_primary_role text;
  v_partner_role text;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'ACCOMMODATION_SHARE_ACTOR_REQUIRED';
  end if;

  if p_accommodation_plan = 'three_months_shared_2000' then
    v_total := 4000;
    v_share_amount := 2000;
    v_period := 3;
  elsif p_accommodation_plan = 'one_month_shared_625' then
    v_total := 1250;
    v_share_amount := 625;
    v_period := 1;
  else
    raise exception 'INVALID_SHARED_ACCOMMODATION_PLAN';
  end if;

  if p_permit_submission_route not in ('candidate_or_agency','bimed_legal_team') then
    raise exception 'INVALID_PERMIT_SUBMISSION_ROUTE';
  end if;

  if p_permit_fee_eur <> 1000 then
    raise exception 'INVALID_PERMIT_FEE';
  end if;

  if p_permit_duration_months <> 24 then
    raise exception 'INVALID_PERMIT_DURATION';
  end if;

  select *
    into v_primary_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  if v_primary_staff.application_id is null or v_primary_staff.status <> 'pre_arrival' then
    raise exception 'STAFF_NOT_ELIGIBLE_FOR_SHARED_ACCOMMODATION';
  end if;

  select *
    into v_primary_application
  from public.recruitment_applications
  where id = v_primary_staff.application_id;

  select *
    into v_primary_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_primary_staff.id
  for update;

  if not found then
    raise exception 'PERMIT_CASE_NOT_FOUND';
  end if;

  if v_primary_permit.status <> 'not_started'
     or v_primary_permit.requested_at is not null
     or v_primary_permit.cancellation_requested_at is not null
     or v_primary_permit.cancellation_finalized_at is not null
     or v_primary_permit.accommodation_terms_acknowledged_at is not null then
    raise exception 'SHARED_ACCOMMODATION_SELECTION_NOT_AVAILABLE';
  end if;

  if p_permit_type <> (
    case
      when lower(trim(v_primary_application.role_applied)) = 'physiotherapist' then 'critical_skills_employment_permit'
      when lower(trim(v_primary_application.role_applied)) in ('healthcare assistant','senior support worker','support worker') then 'general_employment_permit'
      else null
    end
  ) then
    raise exception 'PERMIT_TYPE_MUST_MATCH_ROLE';
  end if;

  v_partner_id := public.bimed_resolve_staff_for_accommodation_share(p_partner_identifier);

  if v_partner_id = v_primary_staff.id then
    raise exception 'SHARED_PARTNER_CANNOT_BE_SELF';
  end if;

  select *
    into v_partner_staff
  from public.recruitment_staff
  where id = v_partner_id
  for update;

  if v_partner_staff.application_id is null or v_partner_staff.status <> 'pre_arrival' then
    raise exception 'SHARED_PARTNER_NOT_ELIGIBLE';
  end if;

  select *
    into v_partner_application
  from public.recruitment_applications
  where id = v_partner_staff.application_id;

  select *
    into v_partner_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_partner_staff.id
  for update;

  if not found then
    raise exception 'SHARED_PARTNER_PERMIT_CASE_NOT_FOUND';
  end if;

  if v_partner_permit.status <> 'not_started'
     or v_partner_permit.requested_at is not null
     or v_partner_permit.cancellation_requested_at is not null
     or v_partner_permit.cancellation_finalized_at is not null then
    raise exception 'SHARED_PARTNER_NOT_ELIGIBLE';
  end if;

  if v_partner_permit.accommodation_terms_acknowledged_at is not null
     or exists (
       select 1 from public.recruitment_accommodation_invoices
       where permit_case_id = v_partner_permit.id
     ) then
    raise exception 'SHARED_PARTNER_ALREADY_HAS_ACCOMMODATION';
  end if;

  if exists (
    select 1 from public.recruitment_accommodation_shares
    where status = 'active'
      and (primary_staff_id = v_partner_staff.id or partner_staff_id = v_partner_staff.id)
  ) then
    raise exception 'SHARED_PARTNER_ALREADY_SHARED';
  end if;

  v_primary_trigger := case
    when v_primary_permit.permit_submission_route = 'candidate_or_agency' and v_period = 1
      then 'one_month_accommodation_expiry'
    else 'successful_three_month_probation'
  end;

  v_partner_trigger := case
    when v_partner_permit.permit_submission_route = 'candidate_or_agency' and v_period = 1
      then 'one_month_accommodation_expiry'
    else 'successful_three_month_probation'
  end;

  insert into public.recruitment_accommodation_shares(
    share_reference,
    accommodation_plan,
    total_amount_eur,
    share_amount_eur,
    accommodation_period_months,
    primary_staff_id,
    partner_staff_id,
    created_by
  )
  values (
    'BIMED-SHARE-' || upper(substr(md5(random()::text || v_now::text), 1, 8)),
    case when v_period = 3 then 'three_months_4000' else 'one_month_1250' end,
    v_total,
    v_share_amount,
    v_period,
    v_primary_staff.id,
    v_partner_staff.id,
    p_actor
  )
  returning * into v_share_row;

  v_primary_selection := coalesce(p_selection_snapshot, '{}'::jsonb) || jsonb_build_object(
    'shared', true,
    'share_reference', v_share_row.share_reference,
    'share_id', v_share_row.id,
    'share_role', 'primary',
    'total_amount_eur', v_total,
    'share_amount_eur', v_share_row.share_amount_eur,
    'partner_bimed_id', v_partner_staff.bimed_id,
    'partner_name', v_partner_staff.full_name,
    'partner_email', coalesce(v_partner_application.email, v_partner_staff.email),
    'accommodation_period_months', v_period
  );

  v_partner_selection := jsonb_build_object(
    'shared', true,
    'share_reference', v_share_row.share_reference,
    'share_id', v_share_row.id,
    'share_role', 'partner',
    'total_amount_eur', v_total,
    'share_amount_eur', v_share_row.share_amount_eur,
    'primary_bimed_id', v_primary_staff.bimed_id,
    'primary_name', v_primary_staff.full_name,
    'primary_email', coalesce(v_primary_application.email, v_primary_staff.email),
    'accommodation_period_months', v_period,
    'accommodation_plan', p_accommodation_plan,
    'accommodation_refund_trigger', v_partner_trigger,
    'accommodation_refund_installments', 4
  );

  update public.recruitment_staff_permit_cases
  set accommodation_terms_acknowledged_at = v_now,
      accommodation_terms_version = p_terms_version,
      accommodation_terms_acknowledged_name = v_primary_staff.full_name,
      accommodation_invoice_requested_at = v_now,
      accommodation_payment_status = 'invoice_requested',
      accommodation_offered = true,
      accommodation_plan = p_accommodation_plan,
      accommodation_period_months = v_period,
      accommodation_amount_eur = v_share_amount,
      accommodation_refund_amount_eur = v_share_amount,
      accommodation_refund_installments = 4,
      accommodation_refund_installments_paid = 0,
      accommodation_refund_trigger = v_primary_trigger,
      permit_submission_route = p_permit_submission_route,
      permit_type = p_permit_type,
      permit_fee_eur = p_permit_fee_eur,
      permit_duration_months = p_permit_duration_months,
      accommodation_share_id = v_share_row.id,
      accommodation_share_role = 'primary',
      accommodation_share_partner_staff_id = v_partner_staff.id,
      accommodation_selection_snapshot = v_primary_selection,
      updated_at = v_now
  where id = v_primary_permit.id
  returning * into v_primary_permit;

  update public.recruitment_staff_permit_cases
  set accommodation_offered = true,
      accommodation_plan = p_accommodation_plan,
      accommodation_period_months = v_period,
      accommodation_amount_eur = v_share_amount,
      accommodation_refund_amount_eur = v_share_amount,
      accommodation_refund_installments = 4,
      accommodation_refund_installments_paid = 0,
      accommodation_refund_trigger = v_partner_trigger,
      accommodation_invoice_requested_at = v_now,
      accommodation_payment_status = 'invoice_requested',
      accommodation_share_id = v_share_row.id,
      accommodation_share_role = 'partner',
      accommodation_share_partner_staff_id = v_primary_staff.id,
      accommodation_selection_snapshot = v_partner_selection,
      updated_at = v_now
  where id = v_partner_permit.id
  returning * into v_partner_permit;

  insert into public.recruitment_accommodation_invoices(
    permit_case_id, invoice_number, public_token, status, issue_date, due_date,
    amount_eur, currency, description, bill_to_name, bill_to_email, arrangement_snapshot
  )
  values (
    v_primary_permit.id,
    p_primary_invoice_number,
    p_primary_public_token,
    'draft',
    v_now::date,
    p_due_date,
    v_share_amount,
    'EUR',
    case when v_period = 3
      then 'BIMED-arranged shared accommodation for the initial three-month probationary period — your 50% share'
      else 'BIMED-arranged shared accommodation for the first month — your 50% share'
    end,
    v_primary_staff.full_name,
    coalesce(v_primary_application.email, v_primary_staff.email),
    v_primary_selection
  )
  returning * into v_primary_invoice;

  insert into public.recruitment_accommodation_invoices(
    permit_case_id, invoice_number, public_token, status, issue_date, due_date,
    amount_eur, currency, description, bill_to_name, bill_to_email, arrangement_snapshot
  )
  values (
    v_partner_permit.id,
    p_partner_invoice_number,
    p_partner_public_token,
    'draft',
    v_now::date,
    p_due_date,
    v_share_amount,
    'EUR',
    case when v_period = 3
      then 'BIMED-arranged shared accommodation for the initial three-month probationary period — your 50% share'
      else 'BIMED-arranged shared accommodation for the first month — your 50% share'
    end,
    v_partner_staff.full_name,
    coalesce(v_partner_application.email, v_partner_staff.email),
    v_partner_selection
  )
  returning * into v_partner_invoice;

  insert into public.recruitment_staff_audit_log(staff_id, action, actor, event_type, metadata)
  values
    (
      v_primary_staff.id, 'shared_accommodation_created', p_actor,
      'shared_accommodation_created',
      jsonb_build_object(
        'share_id', v_share_row.id,
        'share_reference', v_share_row.share_reference,
        'partner_staff_id', v_partner_staff.id,
        'partner_bimed_id', v_partner_staff.bimed_id,
        'total_amount_eur', v_total,
        'share_amount_eur', v_share_row.share_amount_eur,
        'primary_invoice_id', v_primary_invoice.id,
        'partner_invoice_id', v_partner_invoice.id,
        'atomic_workflow', true
      )
    ),
    (
      v_partner_staff.id, 'shared_accommodation_invited', p_actor,
      'shared_accommodation_invited',
      jsonb_build_object(
        'share_id', v_share_row.id,
        'share_reference', v_share_row.share_reference,
        'primary_staff_id', v_primary_staff.id,
        'primary_bimed_id', v_primary_staff.bimed_id,
        'total_amount_eur', v_total,
        'share_amount_eur', v_share_row.share_amount_eur,
        'partner_invoice_id', v_partner_invoice.id,
        'atomic_workflow', true
      )
    );

  return jsonb_build_object(
    'share_id', v_share_row.id,
    'share_reference', v_share_row.share_reference,
    'primary_staff_id', v_primary_staff.id,
    'partner_staff_id', v_partner_staff.id,
    'primary_invoice_id', v_primary_invoice.id,
    'partner_invoice_id', v_partner_invoice.id,
    'primary_permit_id', v_primary_permit.id,
    'partner_permit_id', v_partner_permit.id,
    'share_amount_eur', v_share_row.share_amount_eur,
    'total_amount_eur', v_total,
    'already_exists', false
  );
end;
$$;


revoke all on function public.bimed_acknowledge_shared_accommodation_options(
  uuid,text,text,text,text,text,numeric,integer,jsonb,text,text,text,text,text,date
) from public, anon, authenticated;
grant execute on function public.bimed_acknowledge_shared_accommodation_options(
  uuid,text,text,text,text,text,numeric,integer,jsonb,text,text,text,text,text,date
) to service_role;

commit;
