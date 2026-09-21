import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED interview lifecycle integrity', () => {
  it('uses one atomic server action for interview creation and status transition', async () => {
    const route = await fs.readFile('app/api/admin/applications/[id]/interviews/route.ts', 'utf8');
    const helper = await fs.readFile('lib/bimed-lifecycle.ts', 'utf8');
    const migration = await fs.readFile('supabase/migrations/20260921104050_20260919_bimed_interview_atomicity.sql', 'utf8');

    expect(route).toContain('scheduleBimedInterview');
    expect(route).not.toContain(".update({ status: 'Interview'");
    expect(helper).toContain("rpc('bimed_schedule_recruitment_interview'");
    expect(migration).toContain('for update');
    expect(migration).toContain('recruitment_interviews');
    expect(migration).toContain('STATUS_TRANSITION_BLOCKED');
  });
});
