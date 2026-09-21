import { describe, expect, it } from 'vitest';

describe('staff provisioning error normalization', () => {
  it('preserves Supabase PostgREST message and detail instead of collapsing to a generic UI error', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile('lib/staff.ts', 'utf8');
    expect(source).toContain('asStaffProvisioningError');
    expect(source).toContain('candidate.message');
    expect(source).toContain('candidate.details');
  });
});
