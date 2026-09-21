-- Final reconciliation for sponsorship-cancellation workflow.
-- Earlier 20260918 migration files are retained for history. This migration
-- intentionally runs after them and restores the corrected definitions and scheduler.

create extension if not exists pg_cron with schema pg_catalog;

-- Repair sponsorship-cancellation RPCs to match recruitment_staff_audit_log's
-- required action + event_type columns.

create or replace function public.bimed_request_staff_sponsorship_cancellation(
  p_staff_id uuid, p_actor text, p_reason text
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
  v_application public.recruitment_applications%rowtype;
  v_now timestamptz := clock_timestamp();
  v_deadline timestamptz;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_staff from public.recruitment_staff where id = p_staff_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.application_id is null then raise exception 'STAFF_NOT_RECRUITMENT_LINKED'; end if;
  if v_staff.status not in ('pre_arrival', 'active', 'on_leave') then raise exception 'STAFF_PORTAL_NOT_ELIGIBLE'; end if;

  select * into v_permit from public.recruitment_staff_permit_cases where staff_id = v_staff.id for update;
  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  if v_permit.cancellation_finalized_at is not null
     or (v_staff.status = 'suspended' and v_staff.portal_restriction_reason = 'sponsorship_cancellation') then
    raise exception 'SPONSORSHIP_CANCELLATION_FINALIZED';
  end if;

  if v_permit.cancellation_requested_at is not null
     and v_permit.cancellation_revoked_at is null
     and v_permit.cancellation_finalized_at is null
     and v_permit.cancellation_deadline_at is not null
     and v_permit.cancellation_deadline_at <= v_now then
    raise exception 'SPONSORSHIP_CANCELLATION_DEADLINE_PASSED';
  end if;

  if v_permit.cancellation_requested_at is not null
     and v_permit.cancellation_revoked_at is null
     and v_permit.cancellation_finalized_at is null
     and v_permit.cancellation_deadline_at > v_now then
    return jsonb_build_object(
      'staff_id', v_staff.id,
      'permit_id', v_permit.id,
      'requested_at', v_permit.cancellation_requested_at,
      'deadline_at', v_permit.cancellation_deadline_at,
      'already_requested', true
    );
  end if;

  select * into v_invoice
  from public.recruitment_accommodation_invoices
  where permit_case_id = v_permit.id
  for update;
  if not found then raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND'; end if;
  if v_invoice.status not in ('issued', 'payment_reported', 'cancellation_requested') then
    raise exception 'ACCOMMODATION_INVOICE_NOT_CANCELABLE';
  end if;

  select * into v_application from public.recruitment_applications where id = v_staff.application_id for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  v_deadline := v_now + interval '24 hours';

  update public.recruitment_accommodation_invoices
  set status = 'cancellation_requested',
      cancellation_requested_at = v_now,
      cancellation_requested_by = 'candidate',
      cancellation_reason = coalesce(v_reason, 'Candidate rejected the accommodation fee and requested cancellation of the accommodation invoice.'),
      updated_at = v_now
  where id = v_invoice.id;

  update public.recruitment_staff_permit_cases
  set cancellation_requested_at = v_now,
      cancellation_requested_by = p_actor,
      cancellation_deadline_at = v_deadline,
      cancellation_reason = coalesce(v_reason, 'Candidate rejected the accommodation fee and requested cancellation of the accommodation invoice.'),
      cancellation_previous_application_status = v_application.status,
      cancellation_previous_invoice_status = v_invoice.status,
      cancellation_previous_payment_status = v_permit.accommodation_payment_status,
      cancellation_revoked_at = null,
      cancellation_finalized_at = null,
      sponsorship_withdrawn_at = null,
      employment_contract_voided_at = null,
      accommodation_payment_status = 'cancellation_requested',
      updated_at = v_now
  where id = v_permit.id;

  insert into public.recruitment_staff_audit_log(staff_id, action, metadata, actor, event_type)
  values (
    v_staff.id,
    'sponsorship_cancellation_requested',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'reason', coalesce(v_reason, 'Candidate rejected the accommodation fee and requested cancellation of the accommodation invoice.'),
      'deadline_at', v_deadline,
      'reversal_window_hours', 24,
      'atomic_workflow', true
    ),
    p_actor,
    'sponsorship_cancellation_requested'
  );

  insert into public.recruitment_audit_log(application_id, actor, event_type, metadata)
  values (
    v_application.id,
    p_actor,
    'sponsorship_cancellation_requested',
    jsonb_build_object(
      'staff_id', v_staff.id,
      'invoice_number', v_invoice.invoice_number,
      'deadline_at', v_deadline,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'staff_id', v_staff.id,
    'permit_id', v_permit.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'requested_at', v_now,
    'deadline_at', v_deadline,
    'already_requested', false
  );
end;
$$;

create or replace function public.bimed_revoke_staff_sponsorship_cancellation(
  p_staff_id uuid, p_actor text
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
  v_application public.recruitment_applications%rowtype;
  v_now timestamptz := clock_timestamp();
  v_restored_invoice_status text;
  v_restored_payment_status text;
begin
  select * into v_staff from public.recruitment_staff where id = p_staff_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.application_id is null then raise exception 'STAFF_NOT_RECRUITMENT_LINKED'; end if;

  select * into v_permit from public.recruitment_staff_permit_cases where staff_id = v_staff.id for update;
  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;
  if v_permit.cancellation_requested_at is null then raise exception 'NO_SPONSORSHIP_CANCELLATION'; end if;
  if v_permit.cancellation_finalized_at is not null then raise exception 'SPONSORSHIP_CANCELLATION_FINALIZED'; end if;
  if v_permit.cancellation_revoked_at is not null then raise exception 'SPONSORSHIP_CANCELLATION_ALREADY_REVOKED'; end if;
  if v_permit.cancellation_deadline_at is null or v_permit.cancellation_deadline_at <= v_now then
    raise exception 'SPONSORSHIP_CANCELLATION_DEADLINE_PASSED';
  end if;

  select * into v_invoice from public.recruitment_accommodation_invoices where permit_case_id = v_permit.id for update;
  if not found then raise exception 'ACCOMMODATION_INVOICE_NOT_FOUND'; end if;
  if v_invoice.status <> 'cancellation_requested' then raise exception 'ACCOMMODATION_INVOICE_NOT_RESTORABLE'; end if;

  select * into v_application from public.recruitment_applications where id = v_staff.application_id for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  v_restored_invoice_status := coalesce(v_permit.cancellation_previous_invoice_status, 'issued');
  if v_restored_invoice_status not in ('issued', 'payment_reported') then v_restored_invoice_status := 'issued'; end if;
  v_restored_payment_status := coalesce(v_permit.cancellation_previous_payment_status, 'not_due');

  update public.recruitment_accommodation_invoices
  set status = v_restored_invoice_status, updated_at = v_now
  where id = v_invoice.id;

  update public.recruitment_staff_permit_cases
  set cancellation_revoked_at = v_now,
      cancellation_deadline_at = null,
      accommodation_payment_status = v_restored_payment_status,
      updated_at = v_now
  where id = v_permit.id;

  insert into public.recruitment_staff_audit_log(staff_id, action, metadata, actor, event_type)
  values (
    v_staff.id,
    'sponsorship_cancellation_revoked',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'restored_invoice_status', v_restored_invoice_status,
      'restored_payment_status', v_restored_payment_status,
      'reversal_window_hours', 24,
      'atomic_workflow', true
    ),
    p_actor,
    'sponsorship_cancellation_revoked'
  );

  insert into public.recruitment_audit_log(application_id, actor, event_type, metadata)
  values (
    v_application.id,
    p_actor,
    'sponsorship_cancellation_revoked',
    jsonb_build_object(
      'staff_id', v_staff.id,
      'invoice_number', v_invoice.invoice_number,
      'restored_application_status', v_application.status,
      'atomic_workflow', true
    )
  );

  return jsonb_build_object(
    'staff_id', v_staff.id,
    'permit_id', v_permit.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'restored_invoice_status', v_restored_invoice_status,
    'deadline_passed', false
  );
end;
$$;

create or replace function public.bimed_enforce_due_sponsorship_cancellations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_application public.recruitment_applications%rowtype;
  v_invoice public.recruitment_accommodation_invoices%rowtype;
  v_contract public.recruitment_contract_signatures%rowtype;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_message text := 'Your 24-hour cancellation window has expired. BIMED has therefore withdrawn your recruitment application, voided the employment contract and ended the employment-permit / sponsorship journey. Your Staff Portal access is now restricted. Contact BIMED at info@bimedhealthcare.com if you believe this action was applied in error.';
begin
  for v_permit in
    select p.*
    from public.recruitment_staff_permit_cases p
    where p.cancellation_requested_at is not null
      and p.cancellation_revoked_at is null
      and p.cancellation_finalized_at is null
      and p.cancellation_deadline_at <= v_now
    order by p.cancellation_deadline_at
    limit 100
    for update skip locked
  loop
    select * into v_staff from public.recruitment_staff where id = v_permit.staff_id for update;
    if not found or v_staff.application_id is null then continue; end if;

    if v_staff.portal_restriction_reason = 'sponsorship_cancellation' and v_staff.status = 'suspended' then
      update public.recruitment_staff_permit_cases
      set cancellation_finalized_at = coalesce(cancellation_finalized_at, v_now),
          updated_at = v_now
      where id = v_permit.id;
      continue;
    end if;

    select * into v_application from public.recruitment_applications where id = v_staff.application_id for update;
    if not found then continue; end if;

    select * into v_invoice from public.recruitment_accommodation_invoices where permit_case_id = v_permit.id for update;

    select * into v_contract
    from public.recruitment_contract_signatures
    where application_id = v_staff.application_id
      and doc_type = 'contract'
      and status = 'signed'
    order by signed_at desc nulls last, issued_at desc
    limit 1
    for update;

    update public.recruitment_applications
    set status = 'Withdrawn',
        admin_notes = trim(coalesce(admin_notes, '') ||
          case when coalesce(admin_notes, '') = '' then '' else E'\n' end ||
          'Application withdrawn automatically after the 24-hour sponsorship-cancellation window expired because the candidate rejected the accommodation fee.'),
        updated_at = v_now
    where id = v_application.id;

    insert into public.recruitment_audit_log(application_id, actor, event_type, metadata)
    values (
      v_application.id,
      'system:sponsorship-cancellation',
      'application_withdrawn_accommodation_fee_rejection',
      jsonb_build_object(
        'staff_id', v_staff.id,
        'invoice_number', v_invoice.invoice_number,
        'cancellation_requested_at', v_permit.cancellation_requested_at,
        'cancellation_deadline_at', v_permit.cancellation_deadline_at
      )
    );

    if v_contract.id is not null then
      update public.recruitment_contract_signatures
      set voided_at = v_now,
          voided_reason = 'Candidate rejected the required accommodation fee and the 24-hour cancellation window expired.'
      where id = v_contract.id;
    end if;

    if v_invoice.id is not null then
      update public.recruitment_accommodation_invoices
      set status = 'cancelled',
          admin_action_at = v_now,
          admin_action_by = 'system:sponsorship-cancellation',
          updated_at = v_now
      where id = v_invoice.id
        and status in ('issued', 'payment_reported', 'cancellation_requested');
    end if;

    update public.recruitment_staff_permit_cases
    set status = 'closed',
        permit_decision = 'withdrawn_by_candidate',
        permit_decision_at = v_now,
        accommodation_payment_status = 'cancelled',
        cancellation_finalized_at = v_now,
        sponsorship_withdrawn_at = v_now,
        employment_contract_voided_at = v_now,
        notes = trim(coalesce(notes, '') ||
          case when coalesce(notes, '') = '' then '' else E'\n' end ||
          'Sponsorship journey closed automatically after the 24-hour accommodation-fee rejection window expired.'),
        updated_at = v_now
    where id = v_permit.id;

    update public.recruitment_staff
    set status = 'suspended',
        portal_previous_status = v_staff.status,
        portal_restriction_reason = 'sponsorship_cancellation',
        portal_restricted_at = v_now,
        portal_restricted_by = 'system:sponsorship-cancellation',
        portal_restriction_message = v_message,
        session_version = greatest(coalesce(v_staff.session_version, 1) + 1, 2),
        updated_at = v_now
    where id = v_staff.id;

    insert into public.recruitment_staff_notifications(staff_id, category, title, body, action_url)
    values (
      v_staff.id,
      'permit',
      'Application withdrawn and portal access restricted',
      'Your 24-hour cancellation window has expired. BIMED has withdrawn your application, voided the employment contract and ended the employment-permit / sponsorship journey. Your Staff Portal access is now restricted. Contact info@bimedhealthcare.com if you believe this action was applied in error.',
      null
    );

    insert into public.recruitment_staff_audit_log(staff_id, action, metadata, actor, event_type)
    values (
      v_staff.id,
      'sponsorship_cancellation_finalized',
      jsonb_build_object(
        'invoice_number', v_invoice.invoice_number,
        'application_withdrawn', true,
        'employment_contract_voided', v_contract.id is not null,
        'portal_restricted', true,
        'finalized_at', v_now,
        'atomic_workflow', true
      ),
      'system:sponsorship-cancellation',
      'sponsorship_cancellation_finalized'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.bimed_request_staff_sponsorship_cancellation(uuid,text,text) from public, anon, authenticated;
revoke all on function public.bimed_revoke_staff_sponsorship_cancellation(uuid,text) from public, anon, authenticated;
revoke all on function public.bimed_enforce_due_sponsorship_cancellations() from public, anon, authenticated;


select cron.unschedule(jobid)
from cron.job
where jobname = 'bimed-enforce-sponsorship-cancellations';

select cron.schedule(
  'bimed-enforce-sponsorship-cancellations',
  '*/5 * * * *',
  $$select public.bimed_enforce_due_sponsorship_cancellations();$$
);
