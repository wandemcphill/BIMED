import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('staff portal restriction audit contract', () => {
  it('supplies the required audit action for restrict and reactivate RPCs', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20260921165915_staff_portal_restriction_audit_action_fix_20260921.sql',
      'utf8',
    );

    expect(migration).toContain('bimed_restrict_staff_portal');
    expect(migration).toContain('bimed_reactivate_staff_portal');
    expect(migration).toContain('insert into public.recruitment_staff_audit_log(');
    expect(migration).toContain("  'staff_portal_restricted',");
    expect(migration).toContain("  'staff_portal_reactivated',");

    const auditInsertMatches = migration.match(
      /insert into public\.recruitment_staff_audit_log\(\s*staff_id,\s*action,\s*actor,\s*event_type,\s*metadata\s*\)/g,
    ) || [];
    expect(auditInsertMatches).toHaveLength(2);
  });
});
