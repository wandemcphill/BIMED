-- Production hardening identified by Supabase advisors.
-- Keep the BIMED message immutability trigger function on a fixed search_path.
ALTER FUNCTION public.prevent_bimed_message_mutation()
  SET search_path = public;

-- Remove the duplicate GiST index; the canonical named index remains.
DROP INDEX IF EXISTS public.workforce_shift_no_overlap;
