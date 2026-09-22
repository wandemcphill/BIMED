import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED shared accommodation partner flow', () => {
  it('supports both shared half-price plans in the policy layer', async () => {
    const source = await fs.readFile('lib/employment-permit-options.ts', 'utf8');
    expect(source).toContain("'three_months_shared_2000'");
    expect(source).toContain("'one_month_shared_625'");
    expect(source).toContain('Your invoice is half of the €4,000 total arrangement.');
    expect(source).toContain('Your invoice is half of the €1,250 total arrangement.');
  });

  it('asks for the sharing candidate and routes shared acknowledgements to the shared RPC', async () => {
    const route = await fs.readFile('app/api/staff/permit/route.ts', 'utf8');
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');

    expect(route).toContain("if (action === 'acknowledge_shared_accommodation')");
    expect(route).toContain("bimed_acknowledge_shared_accommodation_options");
    expect(route).toContain('p_partner_identifier');
    expect(route).toContain("if (action === 'link_existing_shared_accommodation_partner')");
    expect(route).toContain("bimed_link_existing_shared_accommodation_partner");
    expect(route).toContain("if (action === 'acknowledge_shared_accommodation_partner')");
    expect(page).toContain('BIMED ID or BIMED email of the candidate sharing with you');
    expect(page).toContain('Confirm shared plan and issue both invoices');
    expect(page).toContain('Link sharing candidate and issue their invoice');
  });

  it('creates a database relationship and split invoices while preventing duplicate partner sharing', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20260922173000_shared_accommodation_partner_invoicing.sql',
      'utf8',
    );
    expect(migration).toContain('recruitment_accommodation_shares');
    expect(migration).toContain('share_amount_eur');
    expect(migration).toContain('primary_staff_id');
    expect(migration).toContain('partner_staff_id');
    expect(migration).toContain('bimed_acknowledge_shared_accommodation_options');
    expect(migration).toContain('bimed_link_existing_shared_accommodation_partner');
    expect(migration).toContain('bimed_acknowledge_shared_accommodation_partner');
    expect(migration).toContain('SHARED_PARTNER_ALREADY_SHARED');
    expect(migration).toContain('primary_invoice_id');
    expect(migration).toContain('partner_invoice_id');
    expect(migration).toContain("grant execute on function public.bimed_acknowledge_shared_accommodation_options");
  });

  it('locks shared invitees to the arrangement they were assigned', async () => {
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');
    expect(page).toContain('const sharedPartner = permit?.accommodation_share_role === \'partner\'');
    expect(page).toContain('disabled={planLocked || busy || sharedPartner}');
  });
});
