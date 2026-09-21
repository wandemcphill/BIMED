alter table public.recruitment_staff_permit_cases
  add column if not exists cancellation_finalization_email_sent_at timestamptz;

create index if not exists recruitment_staff_permit_cases_cancellation_email_pending_idx
  on public.recruitment_staff_permit_cases(cancellation_finalized_at)
  where cancellation_finalized_at is not null
    and cancellation_finalization_email_sent_at is null;
