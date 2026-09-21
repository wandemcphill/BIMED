create table if not exists public.recruitment_external_contract_verifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.recruitment_applications(id) on delete cascade,
  role_slug text not null,
  source text not null default 'email' check (source = 'email'),
  verified_by text not null,
  verified_at timestamptz not null default now(),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_external_contract_verifications_application_id_idx
  on public.recruitment_external_contract_verifications(application_id);

alter table public.recruitment_external_contract_verifications enable row level security;
revoke all on table public.recruitment_external_contract_verifications from public, anon, authenticated;
grant select, insert, update, delete on table public.recruitment_external_contract_verifications to service_role;

create or replace function public.bimed_record_external_contract_verification(
  p_application_id uuid,
  p_role_slug text,
  p_actor text,
  p_note text
)
returns public.recruitment_external_contract_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.recruitment_applications%rowtype;
  row_out public.recruitment_external_contract_verifications%rowtype;
begin
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_role_slug, '')), '') is null then
    raise exception using errcode='P0001', message='EXTERNAL_CONTRACT_ROLE_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception using errcode='P0001', message='EXTERNAL_CONTRACT_NOTE_REQUIRED';
  end if;

  select *
  into app_row
  from public.recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  if public.normalize_recruitment_role_slug(app_row.role_applied) is distinct from p_role_slug then
    raise exception using errcode='P0001', message='EXTERNAL_CONTRACT_ROLE_MISMATCH';
  end if;

  insert into public.recruitment_external_contract_verifications (
    application_id,
    role_slug,
    source,
    verified_by,
    verified_at,
    note,
    updated_at
  ) values (
    p_application_id,
    p_role_slug,
    'email',
    p_actor,
    clock_timestamp(),
    trim(p_note),
    clock_timestamp()
  )
  on conflict (application_id) do update
  set role_slug = excluded.role_slug,
      source = excluded.source,
      verified_by = excluded.verified_by,
      verified_at = excluded.verified_at,
      note = excluded.note,
      updated_at = excluded.updated_at
  returning * into row_out;

  insert into public.recruitment_audit_log (
    application_id,
    invite_id,
    event_type,
    actor,
    metadata
  ) values (
    app_row.id,
    app_row.invite_id,
    'external_signed_contract_verified',
    p_actor,
    jsonb_build_object(
      'role_slug', p_role_slug,
      'source', 'email',
      'verified_at', row_out.verified_at,
      'note', row_out.note
    )
  );

  return row_out;
end;
$$;

revoke all on function public.bimed_record_external_contract_verification(uuid,text,text,text)
from public, anon, authenticated;

grant execute on function public.bimed_record_external_contract_verification(uuid,text,text,text)
to service_role;

create or replace function public.bimed_promote_application_to_staff(
  p_application_id uuid,
  p_to_status text,
  p_actor text,
  p_note text,
  p_expected_role_slug text,
  p_portal_email text default null,
  p_activation_token_hash text default null,
  p_activation_expires_at timestamptz default null,
  p_refresh_activation boolean default false,
  p_start_date date default '2027-01-11',
  p_end_date date default '2029-01-10'
)
returns public.recruitment_staff
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.recruitment_applications%rowtype;
  contract_row public.recruitment_contract_signatures%rowtype;
  external_contract_row public.recruitment_external_contract_verifications%rowtype;
  staff_row public.recruitment_staff%rowtype;
  now_value timestamptz := clock_timestamp();
  effective_name text;
  effective_address text;
  effective_status text;
  portal_contract_found boolean := false;
  external_contract_found boolean := false;
begin
  if nullif(trim(coalesce(p_actor, '')), '') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  if p_to_status not in ('Onboarding', 'Hired') then
    raise exception using errcode='P0001', message='STAFF_PROMOTION_STATUS_INVALID';
  end if;

  if nullif(trim(coalesce(p_expected_role_slug, '')), '') is null then
    raise exception using errcode='P0001', message='STAFF_PROMOTION_ROLE_REQUIRED';
  end if;

  select *
  into app_row
  from public.recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  select *
  into contract_row
  from public.recruitment_contract_signatures
  where application_id = p_application_id
    and doc_type = 'contract'
    and status = 'signed'
  order by signed_at desc nulls last
  limit 1;
  portal_contract_found := found;

  select *
  into external_contract_row
  from public.recruitment_external_contract_verifications
  where application_id = p_application_id
  for update;
  external_contract_found := found;

  if portal_contract_found and contract_row.role_slug is distinct from p_expected_role_slug then
    raise exception using errcode='P0001', message='SIGNED_CONTRACT_ROLE_MISMATCH';
  end if;

  if external_contract_found and external_contract_row.role_slug is distinct from p_expected_role_slug then
    raise exception using errcode='P0001', message='EXTERNAL_CONTRACT_ROLE_MISMATCH';
  end if;

  if not portal_contract_found and not external_contract_found then
    raise exception using
      errcode='P0001',
      message='SIGNED_CONTRACT_REQUIRED',
      detail='A signed BIMED contract or an administrator-verified externally signed contract is required before staff provisioning.';
  end if;

  insert into public.recruitment_onboarding_checklist(
    application_id, item_key, title, description, required
  ) values
    (
      app_row.id,
      'identity_verified',
      'Identity verified',
      'Passport or other identity evidence has been reviewed and verified before an employment contract is issued.',
      true
    ),
    (
      app_row.id,
      'qualification_evidence_verified',
      'Qualification evidence verified',
      'Required qualification and training evidence has been reviewed for the applied role before an employment contract is issued.',
      true
    ),
    (
      app_row.id,
      'references_verified',
      'References verified',
      'Required professional or employment references have been checked before an employment contract is issued.',
      true
    ),
    (
      app_row.id,
      'right_to_work_verified',
      'Right to work verified',
      'BIMED confirms the candidate''s applicable right-to-work position before lawful commencement of employment.',
      true
    )
  on conflict (application_id, item_key) do nothing;

  if app_row.living_in_ireland = 'No' then
    insert into public.recruitment_onboarding_checklist(
      application_id, item_key, title, description, required
    ) values (
      app_row.id,
      'international_work_permission_verified',
      'International work permission verified',
      'Required employment-permit or sponsorship evidence is a BIMED-controlled post-access verification check for this overseas candidate.',
      true
    )
    on conflict (application_id, item_key) do nothing;
  end if;

  select *
  into staff_row
  from public.recruitment_staff
  where application_id = app_row.id
  for update;

  if found then
    if p_refresh_activation and staff_row.activated_at is null then
      if nullif(trim(coalesce(p_activation_token_hash, '')), '') is null
         or p_activation_expires_at is null then
        raise exception using errcode='P0001', message='STAFF_ACTIVATION_REFRESH_DATA_REQUIRED';
      end if;

      update public.recruitment_staff
      set activation_token_hash = p_activation_token_hash,
          activation_expires_at = p_activation_expires_at,
          updated_at = now_value
      where id = staff_row.id
      returning * into staff_row;
    end if;

    if app_row.bimed_id is distinct from staff_row.bimed_id then
      update public.recruitment_applications
      set bimed_id = staff_row.bimed_id,
          updated_at = now_value
      where id = app_row.id;
    end if;
  else
    if nullif(trim(coalesce(p_portal_email, '')), '') is null then
      raise exception using errcode='P0001', message='STAFF_PORTAL_EMAIL_REQUIRED';
    end if;

    if nullif(trim(coalesce(p_activation_token_hash, '')), '') is null
       or p_activation_expires_at is null then
      raise exception using errcode='P0001', message='STAFF_ACTIVATION_DATA_REQUIRED';
    end if;

    effective_name := coalesce(nullif(trim(contract_row.employee_name), ''), app_row.full_name);
    effective_address := coalesce(nullif(trim(contract_row.employee_address), ''), app_row.address);
    effective_status := case when app_row.living_in_ireland = 'No' then 'pre_arrival' else 'active' end;

    insert into public.recruitment_staff(
      application_id,
      full_name,
      preferred_name,
      email,
      phone,
      date_of_birth,
      nationality,
      role,
      job_title,
      employment_type,
      employment_start_date,
      employment_end_date,
      country,
      status,
      address_line_1,
      activation_token_hash,
      activation_expires_at
    ) values (
      app_row.id,
      effective_name,
      app_row.preferred_name,
      p_portal_email,
      app_row.phone,
      app_row.date_of_birth,
      app_row.nationality,
      app_row.role_applied,
      app_row.role_applied,
      app_row.employment_type,
      p_start_date,
      p_end_date,
      'Ireland',
      effective_status,
      effective_address,
      p_activation_token_hash,
      p_activation_expires_at
    )
    returning * into staff_row;

    update public.recruitment_applications
    set bimed_id = staff_row.bimed_id,
        address = effective_address,
        start_date = p_start_date,
        updated_at = now_value
    where id = app_row.id;
  end if;

  perform public.bimed_transition_application_status(
    app_row.id,
    p_to_status,
    p_actor,
    p_note
  );

  insert into public.recruitment_staff_audit_log(
    staff_id,
    actor,
    action,
    event_type,
    metadata
  ) values (
    staff_row.id,
    p_actor,
    case when p_to_status = 'Hired' then 'candidate_promoted_to_hired' else 'recruitment_status_linked_to_staff' end,
    case when p_to_status = 'Hired' then 'candidate_promoted_to_hired' else 'recruitment_status_linked_to_staff' end,
    jsonb_build_object(
      'application_id', app_row.id,
      'recruitment_status', p_to_status,
      'bimed_id', staff_row.bimed_id,
      'external_contract_verified', external_contract_found,
      'portal_contract_signed', portal_contract_found,
      'promotion_override', false,
      'atomic_promotion', true
    )
  );

  return staff_row;
end;
$$;

revoke all on function public.bimed_promote_application_to_staff(
  uuid,text,text,text,text,text,text,timestamptz,boolean,date,date
) from public, anon, authenticated;

grant execute on function public.bimed_promote_application_to_staff(
  uuid,text,text,text,text,text,text,timestamptz,boolean,date,date
) to service_role;
