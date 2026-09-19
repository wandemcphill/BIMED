create or replace function public.bimed_schedule_recruitment_interview(
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_location text,
  p_meeting_link text,
  p_interviewer text,
  p_candidate_instructions text,
  p_actor text
)
returns public.recruitment_interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  app_row public.recruitment_applications%rowtype;
  interview_row public.recruitment_interviews%rowtype;
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

  if app_row.status <> 'Interview' then
    if not (
      (app_row.status = 'Submitted' and 'Interview' in ('Under Review','Interview','Rejected','Withdrawn'))
      or (app_row.status = 'Under Review' and 'Interview' in ('Interview','Documents Awaiting','Rejected','Withdrawn'))
      or (app_row.status = 'Interview')
    ) then
      raise exception using
        errcode='P0001',
        message='STATUS_TRANSITION_BLOCKED',
        detail=format('Transition from %s to Interview is not permitted.', app_row.status);
    end if;

    update public.recruitment_applications
    set status='Interview',
        updated_at=now()
    where id=p_application_id;
  end if;

  insert into public.recruitment_interviews(
    application_id,
    scheduled_at,
    duration_minutes,
    location,
    meeting_link,
    interviewer,
    candidate_instructions,
    status
  ) values (
    p_application_id,
    p_scheduled_at,
    p_duration_minutes,
    p_location,
    p_meeting_link,
    p_interviewer,
    p_candidate_instructions,
    'Scheduled'
  )
  returning * into interview_row;

  insert into public.recruitment_audit_log(
    application_id, invite_id, event_type, actor, metadata
  ) values (
    p_application_id,
    app_row.invite_id,
    'interview_scheduled',
    p_actor,
    jsonb_build_object(
      'interview_id', interview_row.id,
      'scheduled_at', interview_row.scheduled_at,
      'status_transitioned', app_row.status <> 'Interview'
    )
  );

  return interview_row;
end;
$$;

revoke all on function public.bimed_schedule_recruitment_interview(
  uuid,timestamptz,integer,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.bimed_schedule_recruitment_interview(
  uuid,timestamptz,integer,text,text,text,text,text
) to service_role;
