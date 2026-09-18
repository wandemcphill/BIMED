-- Prevent a new 24-hour window from being started after an existing window expires.
-- The scheduled enforcer may run every few minutes, but the database itself must reject late reversal/reset attempts.

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
  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  if v_staff.application_id is null then raise exception 'STAFF_NOT_RECRUITMENT_LINKED'; end if;
  if v_staff.status not in ('pre_arrival', 'active', 'on_leave') then
    raise exception 'STAFF_PORTAL_NOT_ELIGIBLE';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = v_staff.id
  for update;

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

  select * into v_application
  from public.recruitment_applications
  where id = v_staff.application_id
  for update;
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

  insert into public.recruitment_staff_audit_log(staff_id, actor, event_type, metadata)
  values (
    v_staff.id,
    p_actor,
    'sponsorship_cancellation_requested',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'reason', coalesce(v_reason, 'Candidate rejected the accommodation fee and requested cancellation of the accommodation invoice.'),
      'deadline_at', v_deadline,
      'reversal_window_hours', 24,
      'atomic_workflow', true
    )
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

revoke all on function public.bimed_request_staff_sponsorship_cancellation(uuid,text,text) from public, anon, authenticated;
