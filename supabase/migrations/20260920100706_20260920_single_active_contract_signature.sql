-- Keep one active issued contract-signature request per BIMED application.
-- Reissuing a contract revokes older unsigned links in the same database transaction.

begin;

alter table public.recruitment_contract_signatures
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

alter table public.recruitment_contract_signatures
  drop constraint if exists recruitment_contract_signatures_status_check;

alter table public.recruitment_contract_signatures
  add constraint recruitment_contract_signatures_status_check
  check (status in ('issued','signed','revoked'));

create index if not exists recruitment_contract_signatures_active_contract_idx
  on public.recruitment_contract_signatures(application_id, created_at desc)
  where doc_type = 'contract' and status = 'issued';


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
  v_now timestamptz := clock_timestamp();
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

  if v_application.status not in ('Offer Issued','Onboarding','Hired') then
    raise exception 'CONTRACT_ISSUANCE_STATUS_BLOCKED';
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


-- Historical reconciliation: where multiple unsigned contract links exist, keep only the
-- newest issued link and revoke older links. Signed contracts are never altered.
with ranked as (
  select
    id,
    row_number() over (
      partition by application_id
      order by issued_at desc nulls last, created_at desc, id desc
    ) as rn
  from public.recruitment_contract_signatures
  where doc_type = 'contract'
    and status = 'issued'
)
update public.recruitment_contract_signatures c
set status = 'revoked',
    revoked_at = clock_timestamp(),
    revoked_reason = 'Historical reconciliation: superseded by a newer issued contract-signature request.'
from ranked r
where c.id = r.id
  and r.rn > 1;

-- An unsigned contract must not remain active for an application that is already rejected.
update public.recruitment_contract_signatures c
set status = 'revoked',
    revoked_at = clock_timestamp(),
    revoked_reason = 'Historical reconciliation: application was already rejected while the contract remained unsigned.'
from public.recruitment_applications a
where c.application_id = a.id
  and c.doc_type = 'contract'
  and c.status = 'issued'
  and a.status = 'Rejected';

commit;
