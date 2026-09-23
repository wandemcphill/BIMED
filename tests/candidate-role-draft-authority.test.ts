import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED candidate role draft authority', () => {
  it('prevents a restored local draft from overwriting the invitation role', () => {
    const source = readFileSync('components/CandidateForm.tsx', 'utf8');

    expect(source).toContain(
      'const canonicalInviteRole = normalizeRecruitmentRole(invite?.role) ?? \'\';',
    );
    expect(source).toContain(
      'role_applied: canonicalInviteRole || current.role_applied,',
    );
  });

  it('keeps the invitation role as the source of truth during submit', () => {
    const source = readFileSync('app/api/applications/route.ts', 'utf8');

    expect(source).toContain(
      'const canonicalInviteRole = normalizeRecruitmentRole(invitation?.role);',
    );
    expect(source).toContain(
      'if (payload.role_applied !== canonicalInviteRole)',
    );
  });
});
