# Legacy migration files

These SQL files are historical repository migrations that do not have a matching entry in the current shared production migration ledger.

They are retained for auditability and source recovery, but they are intentionally **outside** `supabase/migrations/` so the active migration path cannot replay them accidentally.

Do not move files back into the active migration directory unless their production migration version and name have been verified against the shared Supabase migration history.
