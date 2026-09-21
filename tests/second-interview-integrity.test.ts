import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED second interview integrity', () => {
  it('uses the atomic invitation RPC and maps duplicate-active invitations to a conflict', () => {
    const service = readFileSync('lib/second-interview.ts', 'utf8');
    const route = readFileSync('app/api/admin/applications/[id]/second-interview/route.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260921103136_20260919_atomic_second_interview_invitation.sql', 'utf8');

    expect(service).toContain("rpc('bimed_create_second_interview_invitation'");
    expect(service).toContain('ACTIVE_SECOND_INTERVIEW_EXISTS');
    expect(route).toContain('ACTIVE_SECOND_INTERVIEW_EXISTS');
    expect(route).toContain('status: 409');
    expect(migration).toContain('for update');
    expect(migration).toContain('active_second_interview_exists');
    expect(migration).toContain('revoke all on function public.bimed_create_second_interview_invitation');
  });
});
