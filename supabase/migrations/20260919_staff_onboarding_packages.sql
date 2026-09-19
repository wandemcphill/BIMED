create table if not exists public.recruitment_staff_onboarding_packages (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null unique references public.recruitment_staff(id) on delete cascade,
  audience text not null check (audience in ('local_staff','international_staff','clinical_staff')),
  title text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','complete')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruitment_staff_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.recruitment_staff_onboarding_packages(id) on delete cascade,
  task_key text not null,
  category text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','completed','waived')),
  acknowledgement_required boolean not null default true,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.recruitment_staff(id),
  completed_at timestamptz,
  completed_by text,
  document_path text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(package_id, task_key)
);

create index if not exists recruitment_staff_onboarding_tasks_package_idx
  on public.recruitment_staff_onboarding_tasks(package_id, sort_order);

create index if not exists recruitment_staff_onboarding_tasks_status_idx
  on public.recruitment_staff_onboarding_tasks(status);

alter table public.recruitment_staff_onboarding_packages enable row level security;
alter table public.recruitment_staff_onboarding_tasks enable row level security;

revoke all on public.recruitment_staff_onboarding_packages, public.recruitment_staff_onboarding_tasks
  from public, anon, authenticated;

grant all on public.recruitment_staff_onboarding_packages, public.recruitment_staff_onboarding_tasks
  to service_role;

create or replace function public.bimed_acknowledge_staff_onboarding_task(
  p_task_id uuid,
  p_staff_id uuid
)
returns table(
  task_id uuid,
  package_id uuid,
  task_status text,
  acknowledged_at timestamptz,
  package_status text,
  package_completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.recruitment_staff_onboarding_tasks%rowtype;
  package_row public.recruitment_staff_onboarding_packages%rowtype;
  now_value timestamptz := clock_timestamp();
  done_required integer;
  total_required integer;
  next_status text;
  next_completed_at timestamptz;
begin
  select t.*
  into task_row
  from public.recruitment_staff_onboarding_tasks t
  join public.recruitment_staff_onboarding_packages p on p.id=t.package_id
  where t.id=p_task_id
    and p.staff_id=p_staff_id
  for update;

  if not found then
    raise exception 'STAFF_ONBOARDING_TASK_NOT_FOUND';
  end if;

  if not task_row.acknowledgement_required then
    raise exception 'STAFF_ONBOARDING_ACK_NOT_REQUIRED';
  end if;

  if task_row.acknowledged_at is not null then
    raise exception 'STAFF_ONBOARDING_ALREADY_ACKNOWLEDGED';
  end if;

  select p.*
  into package_row
  from public.recruitment_staff_onboarding_packages p
  where p.id=task_row.package_id
    and p.staff_id=p_staff_id
  for update;

  update public.recruitment_staff_onboarding_tasks
  set acknowledged_at=now_value,
      acknowledged_by=p_staff_id,
      updated_at=now_value
  where id=task_row.id
    and acknowledged_at is null;

  if not found then
    raise exception 'STAFF_ONBOARDING_ALREADY_ACKNOWLEDGED';
  end if;

  select
    count(*) filter (
      where required
        and status in ('completed','waived')
        and (not acknowledgement_required or acknowledged_at is not null)
    ),
    count(*) filter (where required)
  into done_required, total_required
  from public.recruitment_staff_onboarding_tasks
  where package_id=package_row.id;

  if total_required > 0 and done_required=total_required then
    next_status := 'complete';
    next_completed_at := now_value;
  elsif done_required > 0 then
    next_status := 'in_progress';
    next_completed_at := null;
  else
    next_status := 'pending';
    next_completed_at := null;
  end if;

  update public.recruitment_staff_onboarding_packages
  set status=next_status,
      completed_at=next_completed_at,
      updated_at=now_value
  where id=package_row.id
  returning * into package_row;

  task_id := task_row.id;
  package_id := package_row.id;
  task_status := task_row.status;
  acknowledged_at := now_value;
  package_status := package_row.status;
  package_completed_at := package_row.completed_at;
  return next;
end;
$$;

revoke all on function public.bimed_acknowledge_staff_onboarding_task(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.bimed_acknowledge_staff_onboarding_task(uuid,uuid)
  to service_role;
