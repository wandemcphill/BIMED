-- Allow the invited partner to acknowledge the shared accommodation terms.

begin;
create or replace function public.bimed_acknowledge_shared_accommodation_partner(
  p_staff_id uuid,
  p_actor text,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permit public.recruitment_staff_permit_cases%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_permit
  from public.recruitment_staff_permit_cases
  where staff_id=p_staff_id
  for update;

  if not found then raise exception 'PERMIT_CASE_NOT_FOUND'; end if;
  if v_permit.accommodation_share_id is null or v_permit.accommodation_share_role <> 'partner' then
    raise exception 'SHARED_PARTNER_INVITATION_NOT_FOUND';
  end if;

  update public.recruitment_staff_permit_cases
  set accommodation_terms_acknowledged_at=v_now,
      accommodation_terms_version=p_terms_version,
      accommodation_terms_acknowledged_name=(select full_name from public.recruitment_staff where id=v_permit.staff_id),
      updated_at=v_now
  where id=v_permit.id
  returning * into v_permit;

  insert into public.recruitment_staff_audit_log(staff_id,action,actor,event_type,metadata)
  values(
    v_permit.staff_id,
    'shared_accommodation_acknowledged',
    p_actor,
    'shared_accommodation_acknowledged',
    jsonb_build_object('share_id',v_permit.accommodation_share_id,'atomic_workflow',true)
  );

  return jsonb_build_object('permit',to_jsonb(v_permit));
end;
$$;


revoke all on function public.bimed_acknowledge_shared_accommodation_partner(uuid,text,text)
 from public, anon, authenticated;
grant execute on function public.bimed_acknowledge_shared_accommodation_partner(uuid,text,text)
 to service_role;


commit;
