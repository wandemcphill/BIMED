import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED atomic staff activation', () => {
  it('delegates activation state mutation to a locked database RPC', () => {
    const route = readFileSync('app/api/staff/auth/activate/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260919_bimed_staff_activation_atomic.sql', 'utf8');

    expect(route).toContain("bimed_activate_staff_account");
    expect(route).not.toContain(".from('recruitment_staff').update({");
    expect(migration).toContain('for update');
    expect(migration).toContain('lower(s.email)');
    expect(migration).toContain('ACTIVATION_CHANGED');
    expect(migration).toContain('ACTIVATION_USED');
    expect(migration).toContain('grant execute on function public.bimed_activate_staff_account');
    expect(migration).toContain('staff_account_activated');
  });
});
