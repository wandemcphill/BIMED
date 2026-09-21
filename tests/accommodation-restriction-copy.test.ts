import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('accommodation restriction plan-aware copy', () => {
  it('supports both BIMED accommodation plans and uses the candidate record for the restriction message', async () => {
    const source = await fs.readFile('app/api/admin/staff/route.ts', 'utf8');
    expect(source).toContain('€4,000 for 3 months or €1,250 for 1 month');
    expect(source).toContain("accommodation_amount_eur");
    expect(source).toContain("accommodation_period_months");
    expect(source).toContain("accommodationAmount === 1250 && accommodationPeriod === 1");
    expect(source).toContain("accommodationAmount === 4000 && accommodationPeriod === 3");
    expect(source).toContain('Your recorded plan is');
    expect(source).not.toContain('the required €4,000 accommodation contribution has not been paid');
  });
});
