-- Lock down the SECURITY DEFINER swap-resolution RPC.
-- The route resolves swaps server-side using the service role. Direct execution
-- by browser-facing roles would allow callers to supply an arbitrary actor value.
revoke execute on function public.resolve_staff_shift_swap(uuid, text, boolean) from public;
revoke execute on function public.resolve_staff_shift_swap(uuid, text, boolean) from anon, authenticated;
grant execute on function public.resolve_staff_shift_swap(uuid, text, boolean) to service_role;

-- Keep concurrent swap resolutions from taking the two shift locks in opposite
-- orders. Re-declare the function with deterministic UUID lock ordering.
create or replace function public.resolve_staff_shift_swap(
  p_request_id uuid,
  p_actor text,
  p_approve boolean
)
returns table (
  request_id uuid,
  request_status text,
  first_shift_id uuid,
  second_shift_id uuid,
  first_staff_id uuid,
  second_staff_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r recruitment_shift_requests%rowtype;
  a recruitment_workforce_shifts%rowtype;
  b recruitment_workforce_shifts%rowtype;
  tmp_staff uuid;
  lower_shift_id uuid;
  higher_shift_id uuid;
  locked_shift recruitment_workforce_shifts%rowtype;
begin
  select * into r
    from recruitment_shift_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Shift request not found.';
  end if;

  if r.status <> 'pending' or r.request_type <> 'swap' or r.requested_shift_id is null then
    raise exception using errcode = 'P0001', message = 'This swap request is no longer pending.';
  end if;

  lower_shift_id := least(r.shift_id, r.requested_shift_id);
  higher_shift_id := greatest(r.shift_id, r.requested_shift_id);

  -- Serialize all swap resolutions in the same UUID order to avoid lock-order deadlocks.
  select * into locked_shift
    from recruitment_workforce_shifts
   where id = lower_shift_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'A shift involved in this swap no longer exists.';
  end if;

  select * into locked_shift
    from recruitment_workforce_shifts
   where id = higher_shift_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'A shift involved in this swap no longer exists.';
  end if;

  select * into a from recruitment_workforce_shifts where id = r.shift_id;
  select * into b from recruitment_workforce_shifts where id = r.requested_shift_id;

  if a.staff_id <> r.staff_id then
    raise exception using errcode = 'P0001', message = 'The initiating staff member is no longer assigned to the original shift.';
  end if;

  if a.staff_id is null or b.staff_id is null or a.staff_id = b.staff_id then
    raise exception using errcode = 'P0001', message = 'Both shifts must be assigned to different staff members.';
  end if;

  if a.status not in ('assigned', 'confirmed') or b.status not in ('assigned', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'Only assigned or confirmed shifts can be swapped.';
  end if;

  if a.start_at <= now() or b.start_at <= now() then
    raise exception using errcode = 'P0001', message = 'Past or started shifts cannot be swapped.';
  end if;

  if not p_approve then
    update recruitment_shift_requests
       set status = 'declined', responded_by = p_actor, responded_at = now(), updated_at = now()
     where id = r.id;
  else
    tmp_staff := a.staff_id;
    update recruitment_workforce_shifts
       set staff_id = b.staff_id, updated_at = now()
     where id = a.id;
    update recruitment_workforce_shifts
       set staff_id = tmp_staff, updated_at = now()
     where id = b.id;
    update recruitment_shift_requests
       set status = 'approved', responded_by = p_actor, responded_at = now(), updated_at = now()
     where id = r.id;
  end if;

  return query
  select r.id,
         case when p_approve then 'approved' else 'declined' end,
         a.id,
         b.id,
         case when p_approve then b.staff_id else a.staff_id end,
         case when p_approve then a.staff_id else b.staff_id end;
end;
$$;

revoke execute on function public.resolve_staff_shift_swap(uuid, text, boolean) from public;
revoke execute on function public.resolve_staff_shift_swap(uuid, text, boolean) from anon, authenticated;
grant execute on function public.resolve_staff_shift_swap(uuid, text, boolean) to service_role;
