import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED staff password recovery', () => {
  it('uses an atomic, non-enumerating reset completion flow', () => {
    const route = readFileSync('app/api/staff/auth/password-reset/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260918zz_staff_password_reset.sql', 'utf8');
    const atomicMigration = readFileSync('supabase/migrations/20260919_staff_password_reset_atomic.sql', 'utf8');

    expect(route).toContain('staff-password-reset-email:');
    expect(route).toContain('bimed_complete_staff_password_reset');
    expect(route).toContain('staff-password-reset-token:');
    expect(migration).toContain('recruitment_staff_password_reset_tokens');
    expect(atomicMigration).toContain('bimed_complete_staff_password_reset');
    expect(atomicMigration).toContain('for update');
  });
});
