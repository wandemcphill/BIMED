-- Harden the canonical BIMED permit lifecycle boundary.
--
-- Status transitions own permit/visa decision fields and work-authorisation
-- eligibility. Non-lifecycle permit details use a separate audited RPC.
-- Direct client table access remains revoked; these functions are service_role-only.

begin;

create or replace function public.bimed_transition_staff_permit_status(
  p_permit_case_id uuid,
  p_actor text,
  p_to_status text,
  p_note text default null
)
returns public.recruitment_staff_permit_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_application_id uuid;
  v_allowed boolean := false;
  v_from_status text;
  v_now timestamptz := clock_timestamp();
  v_work_authorised boolean;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'PERMIT_ACTOR_REQUIRED'; end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = p_permit_case_id
  for update;

  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  select *
    into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;

  v_from_status := v_permit.status;

  if p_to_status is null or p_to_status not in (
    'not_started','requested','admin_review','permit_preparation',
    'permit_submitted','permit_granted','permit_refused',
    'visa_preparation','visa_submitted','visa_granted','visa_refused',
    'arrived','closed'
  ) then
    raise exception 'INVALID_PERMIT_STATUS';
  end if;

  v_allowed :=
    v_permit.status = p_to_status
    or (v_permit.status = 'not_started' and p_to_status in ('requested'))
    or (v_permit.status = 'requested' and p_to_status in ('admin_review','permit_preparation','closed'))
    or (v_permit.status = 'admin_review' and p_to_status in ('permit_preparation','closed'))
    or (v_permit.status = 'permit_preparation' and p_to_status in ('permit_submitted','closed'))
    or (v_permit.status = 'permit_submitted' and p_to_status in ('permit_granted','permit_refused','closed'))
    or (v_permit.status = 'permit_granted' and p_to_status in ('visa_preparation','visa_submitted','arrived','closed'))
    or (v_permit.status = 'permit_refused' and p_to_status in ('permit_preparation','closed'))
    or (v_permit.status = 'visa_preparation' and p_to_status in ('visa_submitted','closed'))
    or (v_permit.status = 'visa_submitted' and p_to_status in ('visa_granted','visa_refused','closed'))
    or (v_permit.status = 'visa_granted' and p_to_status in ('arrived','closed'))
    or (v_permit.status = 'visa_refused' and p_to_status in ('visa_preparation','closed'))
    or (v_permit.status = 'arrived' and p_to_status in ('closed'));

  if not v_allowed then
    raise exception 'PERMIT_STATUS_TRANSITION_BLOCKED';
  end if;

  /*
   * Work authorisation is an explicit verification decision, never an
   * automatic grant. Once the journey leaves a legally eligible status,
   * any previous verification is revoked atomically with the transition.
   * Moving within eligible statuses preserves an already-verified decision.
   */
  v_work_authorised := case
    when p_to_status in ('permit_granted','visa_granted','arrived') then v_permit.work_authorised
    else false
  end;

  update public.recruitment_staff_permit_cases
  set status = p_to_status,
      admin_reviewed_at = case when p_to_status = 'admin_review' then v_now else admin_reviewed_at end,
      requested_at = case when p_to_status = 'requested' and requested_at is null then v_now else requested_at end,
      permit_submitted_at = case when p_to_status = 'permit_submitted' and permit_submitted_at is null then v_now else permit_submitted_at end,
      permit_decision_at = case when p_to_status in ('permit_granted','permit_refused') then v_now else permit_decision_at end,
      permit_decision = case
        when p_to_status = 'permit_granted' then 'granted'
        when p_to_status = 'permit_refused' then 'refused'
        else permit_decision
      end,
      visa_submitted_at = case when p_to_status = 'visa_submitted' and visa_submitted_at is null then v_now else visa_submitted_at end,
      visa_decision_at = case when p_to_status in ('visa_granted','visa_refused') then v_now else visa_decision_at end,
      visa_decision = case
        when p_to_status = 'visa_granted' then 'granted'
        when p_to_status = 'visa_refused' then 'refused'
        else visa_decision
      end,
      work_authorised = v_work_authorised,
      shift_eligibility = case when v_work_authorised then 'eligible' else 'blocked' end,
      notes = case
        when nullif(btrim(p_note), '') is null then notes
        else trim(
          coalesce(notes,'') ||
          case when coalesce(notes,'') = '' then '' else E'\n' end ||
          p_note
        )
      end,
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_staff.id,
    'permit_status_transition',
    p_actor,
    'permit_status_transition',
    jsonb_build_object(
      'from_status', v_from_status,
      'to_status', p_to_status,
      'note', p_note,
      'work_authorised', v_permit.work_authorised,
      'shift_eligibility', v_permit.shift_eligibility,
      'atomic_workflow', true
    )
  );

  v_application_id := v_staff.application_id;
  if v_application_id is not null then
    insert into public.recruitment_audit_log(application_id, actor, event_type, metadata)
    values (
      v_application_id,
      p_actor,
      'permit_status_transition',
      jsonb_build_object(
        'from_status', v_from_status,
        'to_status', p_to_status,
        'note', p_note,
        'atomic_workflow', true
      )
    );
  end if;

  return v_permit;
end;
$$;

revoke all on function public.bimed_transition_staff_permit_status(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_transition_staff_permit_status(uuid,text,text,text)
  to service_role;


create or replace function public.bimed_update_staff_permit_details(
  p_permit_case_id uuid,
  p_actor text,
  p_patch jsonb
)
returns public.recruitment_staff_permit_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_staff public.recruitment_staff%rowtype;
  v_now timestamptz := clock_timestamp();
  v_unknown_key text;
  v_fields text[];
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'PERMIT_ACTOR_REQUIRED';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'PERMIT_DETAILS_PATCH_REQUIRED';
  end if;

  select key
    into v_unknown_key
  from jsonb_object_keys(p_patch) as key
  where key not in (
    'permit_type',
    'permit_application_id',
    'permit_refusal_reason',
    'visa_status',
    'visa_application_reference',
    'visa_refusal_reason',
    'notes'
  )
  limit 1;

  if v_unknown_key is not null then
    raise exception 'PERMIT_DETAILS_FIELD_NOT_ALLOWED';
  end if;

  select *
    into v_permit
  from public.recruitment_staff_permit_cases
  where id = p_permit_case_id
  for update;

  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  select *
    into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;

  if p_patch ? 'permit_refusal_reason'
     and v_permit.status <> 'permit_refused' then
    raise exception 'PERMIT_REFUSAL_REASON_STATUS_REQUIRED';
  end if;

  if p_patch ? 'visa_refusal_reason'
     and v_permit.status <> 'visa_refused' then
    raise exception 'VISA_REFUSAL_REASON_STATUS_REQUIRED';
  end if;

  if (p_patch ? 'visa_status')
     and v_permit.status not in (
       'visa_preparation','visa_submitted','visa_granted','visa_refused','arrived','closed'
     ) then
    raise exception 'VISA_STATUS_STAGE_REQUIRED';
  end if;

  if p_patch ? 'visa_application_reference'
     and v_permit.status not in (
       'visa_preparation','visa_submitted','visa_granted','visa_refused','arrived','closed'
     ) then
    raise exception 'VISA_APPLICATION_STAGE_REQUIRED';
  end if;

  update public.recruitment_staff_permit_cases
  set permit_type = case when p_patch ? 'permit_type' then nullif(btrim(p_patch->>'permit_type'), '') else permit_type end,
      permit_application_id = case when p_patch ? 'permit_application_id' then nullif(btrim(p_patch->>'permit_application_id'), '') else permit_application_id end,
      permit_refusal_reason = case when p_patch ? 'permit_refusal_reason' then nullif(btrim(p_patch->>'permit_refusal_reason'), '') else permit_refusal_reason end,
      visa_status = case when p_patch ? 'visa_status' then nullif(btrim(p_patch->>'visa_status'), '') else visa_status end,
      visa_application_reference = case when p_patch ? 'visa_application_reference' then nullif(btrim(p_patch->>'visa_application_reference'), '') else visa_application_reference end,
      visa_refusal_reason = case when p_patch ? 'visa_refusal_reason' then nullif(btrim(p_patch->>'visa_refusal_reason'), '') else visa_refusal_reason end,
      notes = case when p_patch ? 'notes' then p_patch->>'notes' else notes end,
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  select array_agg(key order by key)
    into v_fields
  from jsonb_object_keys(p_patch) as key;

  insert into public.recruitment_staff_audit_log(
    staff_id, action, actor, event_type, metadata
  )
  values (
    v_staff.id,
    'permit_details_updated',
    p_actor,
    'permit_details_updated',
    jsonb_build_object(
      'fields', to_jsonb(v_fields),
      'atomic_workflow', true
    )
  );

  return v_permit;
end;
$$;

revoke all on function public.bimed_update_staff_permit_details(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.bimed_update_staff_permit_details(uuid,text,jsonb)
  to service_role;

commit;
