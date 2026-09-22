-- Link a partner to an already-issued legacy shared arrangement.

begin;
create or replace function public.bimed_link_existing_shared_accommodation_partner(
  p_staff_id uuid,
  p_actor text,
  p_partner_identifier text,
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
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_partner_invoice public.recruitment_accommodation_invoices%rowtype;
  v_partner_id uuid;
  v_total numeric;
  v_share_amount numeric;
  v_period integer;
  v_share_plan text;
  v_share_row public.recruitment_accommodation_shares%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_primary_staff from public.recruitment_staff where id=p_staff_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  select * into v_primary_permit from public.recruitment_staff_permit_cases where staff_id=v_primary_staff.id for update;
  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  if v_primary_permit.accommodation_share_id is not null then
    raise exception 'SHARED_PARTNER_ALREADY_LINKED';
  end if;

  if v_primary_permit.status <> 'not_started' or v_primary_permit.requested_at is not null then
    raise exception 'SHARED_PARTNER_LINK_NOT_ALLOWED';
  end if;

  if v_primary_permit.accommodation_plan = 'three_months_shared_2000' then
    v_total := 4000; v_share_amount := 2000; v_period := 3; v_share_plan := 'three_months_4000';
  elsif v_primary_permit.accommodation_plan = 'one_month_shared_625' then
    v_total := 1250; v_share_amount := 625; v_period := 1; v_share_plan := 'one_month_1250';
  else
    raise exception 'CURRENT_PLAN_IS_NOT_SHARED';
  end if;

  select * into v_invoice
  from public.recruitment_accommodation_invoices
  where permit_case_id=v_primary_permit.id
  for update;
  if not found then raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND'; end if;
  if v_invoice.status not in ('draft','issued')
     or v_invoice.paid_at is not null
     or v_invoice.payment_reported_at is not null then
    raise exception 'SHARED_PARTNER_LINK_NOT_ALLOWED';
  end if;

  select * into v_primary_application from public.recruitment_applications where id=v_primary_staff.application_id;

  v_partner_id := public.bimed_resolve_staff_for_accommodation_share(p_partner_identifier);
  if v_partner_id = v_primary_staff.id then raise exception 'SHARED_PARTNER_CANNOT_BE_SELF'; end if;

  select * into v_partner_staff from public.recruitment_staff where id=v_partner_id for update;
  if not found or v_partner_staff.status <> 'pre_arrival' then raise exception 'SHARED_PARTNER_NOT_ELIGIBLE'; end if;
  select * into v_partner_application from public.recruitment_applications where id=v_partner_staff.application_id;
  select * into v_partner_permit from public.recruitment_staff_permit_cases where staff_id=v_partner_staff.id for update;
  if not found then raise exception 'SHARED_PARTNER_PERMIT_CASE_NOT_FOUND'; end if;
  if v_partner_permit.status <> 'not_started'
     or v_partner_permit.requested_at is not null
     or v_partner_permit.accommodation_terms_acknowledged_at is not null
     or exists(select 1 from public.recruitment_accommodation_invoices where permit_case_id=v_partner_permit.id) then
    raise exception 'SHARED_PARTNER_ALREADY_HAS_ACCOMMODATION';
  end if;
  if exists(select 1 from public.recruitment_accommodation_shares where status='active' and (primary_staff_id=v_partner_staff.id or partner_staff_id=v_partner_staff.id)) then
    raise exception 'SHARED_PARTNER_ALREADY_SHARED';
  end if;

  insert into public.recruitment_accommodation_shares(
    share_reference, accommodation_plan, total_amount_eur, share_amount_eur,
    accommodation_period_months, primary_staff_id, partner_staff_id, created_by
  )
  values (
    'BIMED-SHARE-' || upper(substr(md5(random()::text || v_now::text), 1, 8)),
    v_share_plan, v_total, v_share_amount, v_period, v_primary_staff.id, v_partner_staff.id, p_actor
  )
  returning * into v_share_row;

  update public.recruitment_staff_permit_cases
  set accommodation_share_id=v_share_row.id,
      accommodation_share_role='primary',
      accommodation_share_partner_staff_id=v_partner_staff.id,
      accommodation_selection_snapshot = coalesce(accommodation_selection_snapshot,'{}'::jsonb)
        || jsonb_build_object(
          'shared',true,
          'share_id',v_share_row.id,
          'share_reference',v_share_row.share_reference,
          'share_role','primary',
          'total_amount_eur',v_total,
          'share_amount_eur',v_share_amount,
          'partner_bimed_id',v_partner_staff.bimed_id,
          'partner_name',v_partner_staff.full_name,
          'partner_email',coalesce(v_partner_application.email,v_partner_staff.email)
        ),
      updated_at=v_now
  where id=v_primary_permit.id;

  update public.recruitment_staff_permit_cases
  set accommodation_offered=true,
      accommodation_plan=v_primary_permit.accommodation_plan,
      accommodation_period_months=v_period,
      accommodation_amount_eur=v_share_amount,
      accommodation_refund_amount_eur=v_share_amount,
      accommodation_refund_installments=4,
      accommodation_refund_installments_paid=0,
      accommodation_refund_trigger=coalesce(v_partner_permit.accommodation_refund_trigger, v_primary_permit.accommodation_refund_trigger),
      accommodation_invoice_requested_at=v_now,
      accommodation_payment_status='invoice_requested',
      accommodation_share_id=v_share_row.id,
      accommodation_share_role='partner',
      accommodation_share_partner_staff_id=v_primary_staff.id,
      accommodation_selection_snapshot=jsonb_build_object(
        'shared',true,
        'share_id',v_share_row.id,
        'share_reference',v_share_row.share_reference,
        'share_role','partner',
        'total_amount_eur',v_total,
        'share_amount_eur',v_share_amount,
        'primary_bimed_id',v_primary_staff.bimed_id,
        'primary_name',v_primary_staff.full_name,
        'primary_email',coalesce(v_primary_application.email,v_primary_staff.email),
        'accommodation_plan',v_primary_permit.accommodation_plan,
        'accommodation_period_months',v_period,
        'accommodation_refund_installments',4
      ),
      updated_at=v_now
  where id=v_partner_permit.id;

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
    case when v_period=3
      then 'BIMED-arranged shared accommodation for the initial three-month probationary period — your 50% share'
      else 'BIMED-arranged shared accommodation for the first month — your 50% share'
    end,
    v_partner_staff.full_name,
    coalesce(v_partner_application.email,v_partner_staff.email),
    jsonb_build_object(
      'shared',true,
      'share_id',v_share_row.id,
      'share_reference',v_share_row.share_reference,
      'share_role','partner',
      'total_amount_eur',v_total,
      'share_amount_eur',v_share_amount,
      'primary_bimed_id',v_primary_staff.bimed_id,
      'primary_name',v_primary_staff.full_name,
      'primary_email',coalesce(v_primary_application.email,v_primary_staff.email),
      'accommodation_plan',v_primary_permit.accommodation_plan,
      'accommodation_period_months',v_period,
      'accommodation_refund_trigger',coalesce(v_partner_permit.accommodation_refund_trigger,v_primary_permit.accommodation_refund_trigger),
      'accommodation_refund_installments',4
    )
  )
  returning * into v_partner_invoice;

  return jsonb_build_object(
    'share_id',v_share_row.id,
    'share_reference',v_share_row.share_reference,
    'partner_staff_id',v_partner_staff.id,
    'partner_invoice_id',v_partner_invoice.id,
    'partner_invoice_number',v_partner_invoice.invoice_number,
    'total_amount_eur',v_total,
    'share_amount_eur',v_share_amount,
    'primary_invoice_id',v_invoice.id
  );
end;
$$;


revoke all on function public.bimed_link_existing_shared_accommodation_partner(uuid,text,text,text,text,date)
 from public, anon, authenticated;
grant execute on function public.bimed_link_existing_shared_accommodation_partner(uuid,text,text,text,text,date)
 to service_role;

commit;
