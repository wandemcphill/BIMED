-- The duplicate advisor finding is caused by two identical exclusion constraints,
-- not two ordinary indexes. Drop only the legacy duplicate constraint and keep the
-- canonical recruitment_workforce_shifts_staff_time_no_overlap constraint.
ALTER TABLE public.recruitment_workforce_shifts
  DROP CONSTRAINT IF EXISTS workforce_shift_no_overlap;

ALTER FUNCTION public.prevent_bimed_message_mutation()
  SET search_path = public;
