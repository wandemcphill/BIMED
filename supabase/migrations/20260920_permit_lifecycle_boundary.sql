-- Canonical BIMED permit lifecycle and right-to-work verification boundary.

begin;

alter table public.recruitment_staff_permit_cases
  add column if not exists work_authorisation_verified_at timestamptz,
  add column if not exists work_authorisation_verified_by text,
  add column if not exists work_authorisation_evidence_note text;

do $$
begin
  alter table public.recruitment_staff_permit_cases
    add constraint recruitment_staff_permit_cases_work_authorisation_shape_chk
    check (
      (work_authorised = true and shift_eligibility = 'eligible')
      or (work_authorised = false and shift_eligibility = 'blocked')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.recruitment_staff_permit_cases
    add constraint recruitment_staff_permit_cases_work_authorisation_evidence_chk
    check (
      work_authorised = false
      or (
        work_authorisation_verified_at is not null
        and nullif(btrim(work_authorisation_verified_by), '') is not null
        and nullif(btrim(work_authorisation_evidence_note), '') is not null
      )
    );
exception
  when duplicate_object then null;
end $$;


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
      notes = case when nullif(btrim(p_note), '') is null then notes
             else trim(coalesce(notes,'') || case when coalesce(notes,'') = '' then '' else E'\n' end || p_note)
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
      jsonb_build_object('to_status', p_to_status, 'note', p_note, 'atomic_workflow', true)
    );
  end if;

  return v_permit;
end;
$$;

revoke all on function public.bimed_transition_staff_permit_status(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_transition_staff_permit_status(uuid,text,text,text)
  to service_role;


create or replace function public.bimed_set_staff_work_authorisation(
  p_permit_case_id uuid,
  p_actor text,
  p_work_authorised boolean,
  p_evidence_note text
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
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'PERMIT_ACTOR_REQUIRED'; end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where id = p_permit_case_id
  for update;

  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  select * into v_staff
  from public.recruitment_staff
  where id = v_permit.staff_id
  for update;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;

  if p_work_authorised then
    if v_permit.status not in ('permit_granted','visa_granted','arrived') then
      raise exception 'WORK_AUTHORISATION_STATUS_NOT_ELIGIBLE';
    end if;

    if nullif(btrim(p_evidence_note), '') is null then
      raise exception 'WORK_AUTHORISATION_EVIDENCE_REQUIRED';
    end if;

    update public.recruitment_staff_permit_cases
    set work_authorised = true,
        shift_eligibility = 'eligible',
        work_authorisation_verified_at = v_now,
        work_authorisation_verified_by = p_actor,
        work_authorisation_evidence_note = btrim(p_evidence_note),
        updated_at = v_now
    where id = v_permit.id
    returning * into v_permit;

    insert into public.recruitment_staff_audit_log(
      staff_id, action, actor, event_type, metadata
    )
    values (
      v_staff.id,
      'work_authorisation_verified',
      p_actor,
      'work_authorisation_verified',
      jsonb_build_object(
        'status', v_permit.status,
        'shift_eligibility', 'eligible',
        'evidence_note', btrim(p_evidence_note),
        'verified_at', v_now,
        'atomic_workflow', true
      )
    );
  else
    update public.recruitment_staff_permit_cases
    set work_authorised = false,
        shift_eligibility = 'blocked',
        updated_at = v_now
    where id = v_permit.id
    returning * into v_permit;

    insert into public.recruitment_staff_audit_log(
      staff_id, action, actor, event_type, metadata
    )
    values (
      v_staff.id,
      'work_authorisation_revoked',
      p_actor,
      'work_authorisation_revoked',
      jsonb_build_object(
        'status', v_permit.status,
        'shift_eligibility', 'blocked',
        'atomic_workflow', true
      )
    );
  end if;

  return v_permit;
end;
$$;

revoke all on function public.bimed_set_staff_work_authorisation(uuid,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.bimed_set_staff_work_authorisation(uuid,text,boolean,text)
  to service_role;

commit;
