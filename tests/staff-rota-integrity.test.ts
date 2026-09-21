import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('BIMED staff rota relationship integrity', () => {
  it('disambiguates the two shift foreign keys in Supabase relation embedding', () => {
    const route = readFileSync('app/api/staff/rota/route.ts', 'utf8');

    expect(route).toContain(
      'shift:recruitment_workforce_shifts!recruitment_shift_requests_shift_id_fkey(*)',
    );
    expect(route).toContain(
      'requested_shift:recruitment_workforce_shifts!requested_shift_id(*)',
    );
    expect(route).not.toContain(
      "shift:recruitment_workforce_shifts(*)",
    );
  });
});
