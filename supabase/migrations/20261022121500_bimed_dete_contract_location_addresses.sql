-- Candidate-specific Irish work and accommodation addresses for DETE contracts.
-- Addresses remain separate from the employee's current/home-country address.

begin;

alter table public.recruitment_staff_permit_cases
  add column if not exists accommodation_address text,
  add column if not exists accommodation_unit text,
  add column if not exists accommodation_address_verified_at timestamptz,
  add column if not exists accommodation_address_verified_by text,
  add column if not exists accommodation_shared_with_staff_id uuid
    references public.recruitment_staff(id) on delete set null;

alter table public.recruitment_staff_permit_cases
  drop constraint if exists recruitment_staff_permit_cases_accommodation_unit_check;

alter table public.recruitment_staff_permit_cases
  add constraint recruitment_staff_permit_cases_accommodation_unit_check
  check (
    accommodation_unit is null or
    accommodation_unit = any (array['Flat 1','Flat 2','Flat 3','Flat 4','Flat 5','Flat 6','Flat 7','Flat 8','Other']::text[])
  );

create index if not exists recruitment_staff_permit_cases_accommodation_address_unit_idx
  on public.recruitment_staff_permit_cases (lower(btrim(accommodation_address)), accommodation_unit)
  where accommodation_address is not null and accommodation_unit is not null;

create or replace function public.bimed_update_staff_contract_locations(
  p_staff_id uuid,
  p_primary_assignment text,
  p_accommodation_unit text,
  p_accommodation_address text,
  p_shared_with_bimed_id text,
  p_actor text,
  p_addresses_confirmed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff public.recruitment_staff%rowtype;
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_partner_id uuid;
  v_primary_assignment text := btrim(coalesce(p_primary_assignment, ''));
  v_unit text := btrim(coalesce(p_accommodation_unit, ''));
  v_address text := btrim(coalesce(p_accommodation_address, ''));
  v_actor text := btrim(coalesce(p_actor, ''));
  v_now timestamptz := clock_timestamp();
begin
  if p_addresses_confirmed is distinct from true then
    raise exception 'CONTRACT_LOCATIONS_CONFIRMATION_REQUIRED';
  end if;
  if v_actor = '' then raise exception 'CONTRACT_LOCATIONS_ACTOR_REQUIRED'; end if;
  if length(v_primary_assignment) < 5 or length(v_primary_assignment) > 500 then
    raise exception 'PRIMARY_ASSIGNMENT_ADDRESS_INVALID';
  end if;
  if v_unit not in ('Flat 1','Flat 2','Flat 3','Flat 4','Flat 5','Flat 6','Flat 7','Flat 8','Other') then
    raise exception 'ACCOMMODATION_UNIT_INVALID';
  end if;
  if length(v_address) < 10 or length(v_address) > 1000 then
    raise exception 'ACCOMMODATION_ADDRESS_INVALID';
  end if;

  if v_unit <> 'Other' then
    if v_address <> (v_unit || ', 19 Pope’s Quay, Cork, T23 PXV5, Ireland') then
      raise exception 'ACCOMMODATION_ADDRESS_DOES_NOT_MATCH_SELECTED_FLAT';
    end if;
  end if;

  select * into v_staff
  from public.recruitment_staff
  where id = p_staff_id
  for update;

  if not found then raise exception 'STAFF_RECORD_NOT_FOUND'; end if;
  if v_staff.application_id is null or v_staff.status <> 'pre_arrival' then
    raise exception 'CONTRACT_LOCATIONS_ONLY_FOR_PRE_ARRIVAL_RECRUITS';
  end if;

  select * into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id = p_staff_id
  for update;

  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;

  if exists (
    select 1
    from public.recruitment_dete_contract_signatures sig
    where sig.staff_id = p_staff_id and sig.status = 'signed'
  ) then
    raise exception 'SIGNED_DETE_CONTRACT_EXISTS';
  end if;

  v_partner_id := null;
  if nullif(btrim(coalesce(p_shared_with_bimed_id, '')), '') is not null then
    select id into v_partner_id
    from public.recruitment_staff
    where lower(btrim(bimed_id)) = lower(btrim(p_shared_with_bimed_id))
      and id <> p_staff_id
    limit 1;

    if v_partner_id is null then
      raise exception 'SHARED_ACCOMMODATION_PARTNER_NOT_FOUND';
    end if;
  end if;

  -- Serialize writes for the same address/unit so two concurrent allocations cannot
  -- silently assign one flat to unrelated candidates.
  perform pg_advisory_xact_lock(
    hashtext(lower(v_address)),
    hashtext(lower(v_unit))
  );

  if exists (
    select 1
    from public.recruitment_staff_permit_cases other_permit
    where other_permit.staff_id <> p_staff_id
      and lower(btrim(coalesce(other_permit.accommodation_address, ''))) = lower(v_address)
      and other_permit.accommodation_unit = v_unit
      and (
        other_permit.staff_id is distinct from v_partner_id
        or other_permit.accommodation_shared_with_staff_id is distinct from p_staff_id
      )
  ) then
    raise exception 'ACCOMMODATION_UNIT_ALREADY_ASSIGNED_TO_ANOTHER_CANDIDATE';
  end if;

  update public.recruitment_staff
  set primary_location = v_primary_assignment,
      updated_at = v_now
  where id = p_staff_id;

  update public.recruitment_staff_permit_cases
  set accommodation_address = v_address,
      accommodation_unit = v_unit,
      accommodation_shared_with_staff_id = v_partner_id,
      accommodation_address_verified_at = v_now,
      accommodation_address_verified_by = v_actor,
      updated_at = v_now
  where id = v_permit.id
  returning * into v_permit;

  -- An unsigned prior issue must not keep circulating with stale address details.
  update public.recruitment_dete_contract_signatures
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = 'Contract locations were updated; reissue using the verified addresses.',
      updated_at = v_now
  where staff_id = p_staff_id and status = 'issued';

  insert into public.recruitment_staff_audit_log (
    staff_id, action, actor, event_type, metadata
  ) values (
    p_staff_id,
    'contract_locations_verified',
    v_actor,
    'contract_locations_verified',
    jsonb_build_object(
      'primary_assignment', v_primary_assignment,
      'accommodation_unit', v_unit,
      'accommodation_address', v_address,
      'accommodation_shared_with_staff_id', v_partner_id,
      'verified_at', v_now
    )
  );

  return jsonb_build_object(
    'staff_id', p_staff_id,
    'primary_assignment', v_primary_assignment,
    'accommodation_unit', v_unit,
    'accommodation_address', v_address,
    'accommodation_shared_with_staff_id', v_partner_id,
    'accommodation_address_verified_at', v_now,
    'accommodation_address_verified_by', v_actor
  );
end;
$$;

revoke all on function public.bimed_update_staff_contract_locations(uuid,text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.bimed_update_staff_contract_locations(uuid,text,text,text,text,text,boolean)
  to service_role;

commit;
