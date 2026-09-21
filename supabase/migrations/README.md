# Supabase migration ledger

This directory is the canonical ledger mirror for the shared BIMED/LAUREM Supabase project.

Production migration history is shared across BIMED and LAUREM. Historical entries whose original SQL is owned by the other migration stream are represented here as inert ledger stubs. They are **not** a replacement for the source SQL of those systems.

For migrations whose original BIMED SQL remains in this repository, the filename uses the exact production migration version and name recorded in `supabase_migrations.schema_migrations`.

Legacy repository migration files that do not correspond to a production ledger entry are retained under `supabase/migrations_legacy/` for historical reference and are intentionally outside the active migration path.

Do not manually edit `supabase_migrations.schema_migrations`. Future production migrations must be applied through the controlled migration workflow and the resulting production version/name must be reflected in this directory.
