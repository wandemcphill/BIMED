import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED atomic staff activation', () => {
  it('delegates activation state mutation to a locked database RPC', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919221837_20260919_bimed_staff_activation_atomic.sql', 'utf8');
    const fixMigration = readFileSync('supabase/migrations/20260919222102_20260919_bimed_staff_activation_atomic_fix.sql', 'utf8');

    expect(route).toContain("bimed_activate_staff_account");
    expect(route).not.toContain(".from('recruitment_staff').update({");
    expect(migration).toContain('for update');
    expect(fixMigration).toContain('lower(s.email)');
    expect(fixMigration).toContain('for update');
    expect(migration).toContain('ACTIVATION_CHANGED');
    expect(migration).toContain('ACTIVATION_USED');
    expect(migration).toContain('grant execute on function public.bimed_activate_staff_account');
    expect(migration).toContain('staff_account_activated');
  });
});


describe('staff activation audit contract', () => {
  it('supplies the mandatory audit action field', async () => {
    const fs = await import('node:fs/promises');
    const migration = await fs.readFile(
      'supabase/migrations/20260921211500_20260921_bimed_staff_activation_audit_action_fix.sql',
      'utf8',
    );

    expect(migration).toContain('insert into public.recruitment_staff_audit_log(');
    expect(migration).toContain('    action,');
    expect(migration).toContain("    'staff_account_activated',");
    expect(migration).toContain("    'staff_account_activated',");
  });
});
