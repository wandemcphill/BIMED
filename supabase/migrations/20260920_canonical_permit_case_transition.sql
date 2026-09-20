-- Canonical BIMED permit-case mutation boundary.
-- Keeps the admin portal's existing fields but makes status/work-authorisation
-- changes atomic with the canonical staff/application audit entries.

begin;

create or replace function public.bimed_update_permit_case_atomic(
  p_staff_id uuid,
  p_actor text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.recruitment_staff%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_application public.recruitment_applications%rowtype;
  v_new_status text;
  v_work_authorised boolean;
  v_shift_eligibility text;
  v_now timestamptz := clock_timestamp();
  v_changed_status boolean := false;
  v_changed_work_auth boolean := false;
  v_previous_status text;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'PERMIT_CASE_ACTOR_REQUIRED';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'PERMIT_CASE_PATCH_REQUIRED';
  end if;

  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = p_staff_id
  for update;

  if not found then
    raise exception 'PERMIT_CASE_NOT_FOUND';
  end if;

  if v_staff.application_id is not null then
    select * into v_application
    from public.recruitment_applications
    where id = v_staff.application_id
    for update;
  end if;

  v_previous_status := v_permit.status;

  v_new_status := case
    when p_patch ? 'status' then nullif(btrim(p_patch->>'status'), '')
    else v_permit.status
  end;

  if v_new_status is null then
    raise exception 'INVALID_PERMIT_STATUS';
  end if;

  if v_new_status <> v_permit.status then
    v_changed_status := true;

    if not (
      (v_permit.status = 'not_started' and v_new_status in ('requested','admin_review','closed'))
      or (v_permit.status = 'requested' and v_new_status in ('admin_review','permit_preparation','closed'))
      or (v_permit.status = 'admin_review' and v_new_status in ('permit_preparation','closed'))
      or (v_permit.status = 'permit_preparation' and v_new_status in ('permit_submitted','closed'))
      or (v_permit.status = 'permit_submitted' and v_new_status in ('permit_granted','permit_refused','closed'))
      or (v_permit.status = 'permit_granted' and v_new_status in ('visa_preparation','visa_submitted','arrived','closed'))
      or (v_permit.status = 'permit_refused' and v_new_status in ('permit_preparation','closed'))
      or (v_permit.status = 'visa_preparation' and v_new_status in ('visa_submitted','closed'))
      or (v_permit.status = 'visa_submitted' and v_new_status in ('visa_granted','visa_refused','closed'))
      or (v_permit.status = 'visa_refused' and v_new_status in ('visa_preparation','closed'))
      or (v_permit.status = 'visa_granted' and v_new_status in ('arrived','closed'))
      or (v_permit.status = 'arrived' and v_new_status in ('closed'))
    ) then
      raise exception 'PERMIT_STATUS_TRANSITION_BLOCKED';
    end if;
  end if;

  if p_patch ? 'work_authorised' then
    v_work_authorised := coalesce((p_patch->>'work_authorised')::boolean, false);
    v_changed_work_auth := v_work_authorised is distinct from v_permit.work_authorised;
  else
    v_work_authorised := v_permit.work_authorised;
  end if;

  v_shift_eligibility := case when v_work_authorised then 'eligible' else 'blocked' end;

  if v_new_status in ('permit_refused','visa_refused','closed') then
    v_work_authorised := false;
    v_shift_eligibility := 'blocked';
  end if;

  update public.recruitment_staff_permit_cases
  set status = v_new_status,
      permit_type = case when p_patch ? 'permit_type' then nullif(btrim(p_patch->>'permit_type'), '') else permit_type end,
      permit_application_id = case when p_patch ? 'permit_application_id' then nullif(btrim(p_patch->>'permit_application_id'), '') else permit_application_id end,
      permit_decision = case when p_patch ? 'permit_decision' then nullif(btrim(p_patch->>'permit_decision'), '') else permit_decision end,
      permit_refusal_reason = case when p_patch ? 'permit_refusal_reason' then nullif(btrim(p_patch->>'permit_refusal_reason'), '') else permit_refusal_reason end,
      visa_status = case when p_patch ? 'visa_status' then nullif(btrim(p_patch->>'visa_status'), '') else visa_status end,
      visa_application_reference = case when p_patch ? 'visa_application_reference' then nullif(btrim(p_patch->>'visa_application_reference'), '') else visa_application_reference end,
      visa_decision = case when p_patch ? 'visa_decision' then nullif(btrim(p_patch->>'visa_decision'), '') else visa_decision end,
      visa_refusal_reason = case when p_patch ? 'visa_refusal_reason' then nullif(btrim(p_patch->>'visa_refusal_reason'), '') else visa_refusal_reason end,
      accommodation_payment_status = case when p_patch ? 'accommodation_payment_status' then nullif(btrim(p_patch->>'accommodation_payment_status'), '') else accommodation_payment_status end,
      accommodation_refund_status = case when p_patch ? 'accommodation_refund_status' then nullif(btrim(p_patch->>'accommodation_refund_status'), '') else accommodation_refund_status end,
      accommodation_refund_amount_eur = case when p_patch ? 'accommodation_refund_amount_eur' then (p_patch->>'accommodation_refund_amount_eur')::numeric else accommodation_refund_amount_eur end,
      accommodation_refund_installments_paid = case when p_patch ? 'accommodation_refund_installments_paid' then (p_patch->>'accommodation_refund_installments_paid')::integer else accommodation_refund_installments_paid end,
      accommodation_agreement_path = case when p_patch ? 'accommodation_agreement_path' then nullif(btrim(p_patch->>'accommodation_agreement_path'), '') else accommodation_agreement_path end,
      work_authorised = v_work_authorised,
      shift_eligibility = v_shift_eligibility,
      notes = case when p_patch ? 'notes' then nullif(btrim(p_patch->>'notes'), '') else notes end,
      permit_submitted_at = case
        when v_new_status in ('permit_submitted','permit_granted','permit_refused')
          then coalesce(permit_submitted_at, v_now)
        else permit_submitted_at
      end,
      permit_decision_at = case
        when v_new_status in ('permit_granted','permit_refused')
          then v_now
        else permit_decision_at
      end,
      visa_submitted_at = case
        when v_new_status = 'visa_submitted'
          then coalesce(visa_submitted_at, v_now)
        else visa_submitted_at
      end,
      visa_decision_at = case
        when v_new_status in ('visa_granted','visa_refused')
          then v_now
        else visa_decision_at
      end,
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_staff.id,
    'permit_case_updated',
    p_actor,
    'employment_permit_case_updated',
    jsonb_build_object(
      'permit_id', v_permit.id,
      'from_status', v_previous_status,
      'to_status', v_new_status,
      'work_authorised', v_permit.work_authorised,
      'shift_eligibility', v_permit.shift_eligibility,
      'work_authorisation_changed', v_changed_work_auth,
      'atomic_workflow', true
    )
  );

  if v_application.id is not null and v_changed_status then
    insert into public.recruitment_audit_log(
      application_id, actor, event_type, metadata
    )
    values (
      v_application.id,
      p_actor,
      'employment_permit_case_status_changed',
      jsonb_build_object(
        'permit_id', v_permit.id,
        'from_status', v_previous_status,
        'to_status', v_new_status,
        'atomic_workflow', true
      )
    );
  end if;

  return jsonb_build_object(
    'permit', to_jsonb(v_permit),
    'staff_id', v_staff.id,
    'application_id', v_application.id,
    'status_changed', v_changed_status,
    'work_authorisation_changed', v_changed_work_auth
  );
end;
$$;

revoke all on function public.bimed_update_permit_case_atomic(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.bimed_update_permit_case_atomic(uuid,text,jsonb)
  to service_role;

commit;
