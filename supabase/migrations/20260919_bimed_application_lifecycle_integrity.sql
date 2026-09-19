create or replace function public.bimed_transition_application_status(
  p_application_id uuid,
  p_to_status text,
  p_actor text,
  p_note text default null
)
returns public.recruitment_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.recruitment_applications%rowtype;
  result_row public.recruitment_applications%rowtype;
  allowed boolean := false;
  blocked_reason text := null;
begin
  if nullif(trim(coalesce(p_actor,'')), '') is null then
    raise exception using errcode='P0001', message='ADMIN_ACTOR_REQUIRED';
  end if;

  select * into app_row
  from public.recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='APPLICATION_NOT_FOUND';
  end if;

  if p_to_status is null or p_to_status not in (
    'Submitted','Under Review','Interview','Selected','Offer Issued',
    'Documents Awaiting','Permit Processing','Visa/Immigration Processing',
    'Onboarding','Hired','Rejected','Withdrawn'
  ) then
    raise exception using errcode='P0001', message='INVALID_RECRUITMENT_STATUS';
  end if;

  allowed := (
    app_row.status = p_to_status
    or (app_row.status = 'Submitted' and p_to_status in ('Under Review','Interview','Rejected','Withdrawn'))
    or (app_row.status = 'Under Review' and p_to_status in ('Interview','Documents Awaiting','Rejected','Withdrawn'))
    or (app_row.status = 'Interview' and p_to_status in ('Selected','Documents Awaiting','Offer Issued','Rejected','Withdrawn'))
    or (app_row.status = 'Selected' and p_to_status in ('Offer Issued','Documents Awaiting','Onboarding','Rejected','Withdrawn'))
    or (app_row.status = 'Offer Issued' and p_to_status in ('Documents Awaiting','Onboarding','Rejected','Withdrawn'))
    or (app_row.status = 'Documents Awaiting' and p_to_status in ('Permit Processing','Onboarding','Rejected','Withdrawn'))
    or (app_row.status = 'Permit Processing' and p_to_status in ('Visa/Immigration Processing','Onboarding','Rejected','Withdrawn'))
    or (app_row.status = 'Visa/Immigration Processing' and p_to_status in ('Onboarding','Rejected','Withdrawn'))
    or (app_row.status = 'Onboarding' and p_to_status in ('Hired','Rejected','Withdrawn'))
  );

  if not allowed then
    blocked_reason := format('Transition from %s to %s is not permitted.', app_row.status, p_to_status);
  end if;

  if blocked_reason is not null then
    insert into public.recruitment_audit_log(
      application_id, invite_id, event_type, actor, metadata
    ) values (
      app_row.id,
      app_row.invite_id,
      'recruitment_status_transition_blocked',
      p_actor,
      jsonb_build_object(
        'from_status', app_row.status,
        'to_status', p_to_status,
        'reason', blocked_reason
      )
    );

    raise exception using errcode='P0001', message='STATUS_TRANSITION_BLOCKED', detail=blocked_reason;
  end if;

  update public.recruitment_applications
  set status = p_to_status,
      updated_at = now()
  where id = p_application_id
  returning * into result_row;

  insert into public.recruitment_audit_log(
    application_id, invite_id, event_type, actor, metadata
  ) values (
    result_row.id,
    result_row.invite_id,
    'recruitment_status_transition',
    p_actor,
    jsonb_build_object(
      'from_status', app_row.status,
      'to_status', p_to_status,
      'note', p_note
    )
  );

  return result_row;
end;
$$;

revoke all on function public.bimed_transition_application_status(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bimed_transition_application_status(uuid,text,text,text)
  to service_role;
