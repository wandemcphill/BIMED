-- Run sponsorship-cancellation enforcement every five minutes.
select cron.unschedule(jobid)
from cron.job
where jobname = 'bimed-enforce-sponsorship-cancellations';

select cron.schedule(
  'bimed-enforce-sponsorship-cancellations',
  '*/5 * * * *',
  $$select public.bimed_enforce_due_sponsorship_cancellations();$$
);
