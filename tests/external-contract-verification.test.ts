import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('external signed contract verification', () => {
  it('provides an explicit administrator verification path without impersonating portal e-signature', async () => {
    const route = await fs.readFile(
      'app/api/admin/applications/[id]/contract-signature/external/route.ts',
      'utf8',
    );
    const page = await fs.readFile('components/AdminApplicationDetail.tsx', 'utf8');
    const staff = await fs.readFile('lib/staff.ts', 'utf8');

    expect(route).toContain("bimed_record_external_contract_verification");
    expect(route).toContain('p_note: note');
    expect(page).toContain('Record signed contract received by email');
    expect(page).toContain('does not pretend that the portal e-signature was completed');
    expect(staff).toContain('recruitment_external_contract_verifications');
    expect(staff).toContain('A signed BIMED contract or an administrator-verified externally signed contract is required');
  });
});
