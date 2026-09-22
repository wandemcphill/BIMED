import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED permit selection amount and Zambia profile correction', () => {
  it('uses the currently selected accommodation option for the acknowledgement amount before confirmation', async () => {
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');
    expect(page).toContain('selectedPlanOption && !termsAcknowledged');
    expect(page).toContain("Number(selectedPlanOption.accommodation_amount_eur)");
    expect(page).toContain('The amount shown here always matches the plan currently selected above.');
  });

  it('keeps the Zambia residential correction as a database migration', async () => {
    const migrations = await fs.readFile('supabase/migrations/20260922161000_fix_bh_001029_zambia_residential_address.sql', 'utf8').catch(() => '');
    expect(migrations).toContain("where bimed_id = 'BH-001029'");
    expect(migrations).toContain("country = 'Zambia'");
    expect(migrations).toContain("portal_address = 'Lusaka, Zambia'");
  });
});
