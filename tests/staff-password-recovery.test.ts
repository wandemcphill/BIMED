import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED staff password recovery', () => {
  it('uses an atomic, non-enumerating reset completion flow', () => {
    const route = readFileSync('app/api/staff/auth/password-reset/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations_legacy/20260918zz_staff_password_reset.sql', 'utf8');
    const atomicMigration = readFileSync('supabase/migrations/20260919202121_20260919_staff_password_reset_atomic.sql', 'utf8');
    const securityMigration = readFileSync('supabase/migrations/20260919220615_20260919_staff_password_reset_rls_hardening.sql', 'utf8');
    const issuanceMigration = readFileSync('supabase/migrations/20260919221628_20260919_staff_password_reset_issuance_atomic.sql', 'utf8');

    expect(route).toContain('staff-password-reset-email:');
    expect(route).toContain('bimed_complete_staff_password_reset');
    expect(route).toContain('staff-password-reset-token:');
    expect(route).toContain('bimed_issue_staff_password_reset');
    expect(route).not.toContain(".from('recruitment_staff_password_reset_tokens').update");
    expect(route).not.toContain(".from('recruitment_staff_password_reset_tokens').insert");
    expect(migration).toContain('recruitment_staff_password_reset_tokens');
    expect(atomicMigration).toContain('bimed_complete_staff_password_reset');
    expect(atomicMigration).toContain('for update');
    expect(securityMigration).toContain('enable row level security');
    expect(securityMigration).toContain('grant all on table public.recruitment_staff_password_reset_tokens');
    expect(issuanceMigration).toContain('for update');
    expect(issuanceMigration).toContain('recruitment_staff_password_reset_tokens');
    expect(issuanceMigration).toContain('grant execute on function public.bimed_issue_staff_password_reset');
  });
});
