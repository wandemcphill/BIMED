create or replace function public.bimed_issue_contract_signature_request(
  p_application_id uuid,
  p_role_slug text,
  p_token_hash text,
  p_employee_name text,
  p_employee_address text,
  p_start_date date,
  p_issued_by text,
  p_expires_at timestamptz
)
returns public.recruitment_contract_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.recruitment_applications%rowtype;
  v_record public.recruitment_contract_signatures%rowtype;
  v_missing_pre_contract text;
  v_now timestamptz := clock_timestamp();
  v_transitioned_to_offer boolean := false;
begin
  if nullif(btrim(p_issued_by), '') is null then
    raise exception 'CONTRACT_ISSUER_REQUIRED';
  end if;

  if nullif(btrim(p_role_slug), '') is null then
    raise exception 'CONTRACT_ROLE_REQUIRED';
  end if;

  if nullif(btrim(p_token_hash), '') is null then
    raise exception 'CONTRACT_TOKEN_REQUIRED';
  end if;

  select *
    into v_application
  from public.recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if v_application.status = 'Submitted' then
    select string_agg(x.title, ', ' order by x.item_key)
      into v_missing_pre_contract
    from public.recruitment_onboarding_checklist x
    where x.application_id = p_application_id
      and x.required
      and x.item_key in ('identity_verified', 'qualification_evidence_verified', 'references_verified')
      and x.status not in ('completed', 'waived');

    if nullif(v_missing_pre_contract, '') is not null then
      raise exception using
        errcode='P0001',
        message='PRE_CONTRACT_VERIFICATION_BLOCKED',
        detail=format('Complete or waive before contract issuance: %s', v_missing_pre_contract);
    end if;

    update public.recruitment_applications
    set status = 'Offer Issued',
        updated_at = v_now
    where id = p_application_id
    returning * into v_application;

    insert into public.recruitment_audit_log(
      application_id,
      invite_id,
      event_type,
      actor,
      metadata
    )
    values (
      v_application.id,
      v_application.invite_id,
      'recruitment_status_transition',
      p_issued_by,
      jsonb_build_object(
        'from_status', 'Submitted',
        'to_status', 'Offer Issued',
        'reason', 'contract_signature_issued_after_pre_contract_verification',
        'atomic_workflow', true
      )
    );

    v_transitioned_to_offer := true;
  elsif v_application.status not in ('Offer Issued', 'Onboarding', 'Hired') then
    raise exception using
      errcode='P0001',
      message='CONTRACT_ISSUANCE_STATUS_BLOCKED',
      detail=format('Contract issuance from %s is not permitted.', v_application.status);
  end if;

  update public.recruitment_contract_signatures
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = 'Replaced by a newer BIMED contract-signature request.'
  where application_id = p_application_id
    and doc_type = 'contract'
    and status = 'issued';

  insert into public.recruitment_contract_signatures(
    application_id,
    doc_type,
    role_slug,
    token_hash,
    employee_name,
    employee_address,
    start_date,
    status,
    issued_by,
    issued_at,
    expires_at,
    created_at
  )
  values (
    p_application_id,
    'contract',
    p_role_slug,
    p_token_hash,
    p_employee_name,
    p_employee_address,
    p_start_date,
    'issued',
    p_issued_by,
    v_now,
    p_expires_at,
    v_now
  )
  returning * into v_record;

  insert into public.recruitment_audit_log(
    application_id, actor, event_type, metadata
  )
  values (
    p_application_id,
    p_issued_by,
    'contract_signature_requested',
    jsonb_build_object(
      'signature_id', v_record.id,
      'role_slug', p_role_slug,
      'replaced_previous_issued_requests', true,
      'transitioned_to_offer_issued', v_transitioned_to_offer,
      'atomic_workflow', true
    )
  );

  return v_record;
end;
$$;

revoke all on function public.bimed_issue_contract_signature_request(
  uuid,text,text,text,text,date,text,timestamptz
) from public, anon, authenticated;

grant execute on function public.bimed_issue_contract_signature_request(
  uuid,text,text,text,text,date,text,timestamptz
) to service_role;
