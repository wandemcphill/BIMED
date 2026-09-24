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
    expect(route).toContain("if (action === 'request_shared_accommodation_match')");
    expect(route).toContain("bimed_request_shared_accommodation_match");
    expect(route).toContain('p_partner_identifier');
    expect(route).toContain("if (action === 'link_existing_shared_accommodation_partner')");
    expect(route).toContain("bimed_link_existing_shared_accommodation_partner");
    expect(route).toContain("if (action === 'acknowledge_shared_accommodation_partner')");
    expect(page).toContain('BIMED ID or BIMED email of the candidate sharing with you');
    expect(page).toContain('Confirm shared plan and issue both invoices');
    expect(page).toContain('Link sharing candidate and issue their invoice');
  });

  it('creates a database relationship and split invoices while preventing duplicate partner sharing', async () => {
    const [schema, createRpc, linkRpc, partnerAck] = await Promise.all([
      fs.readFile('supabase/migrations/20260922173000_shared_accommodation_partner_schema.sql', 'utf8'),
      fs.readFile('supabase/migrations/20260922173200_shared_accommodation_partner_create_rpc.sql', 'utf8'),
      fs.readFile('supabase/migrations/20260922173300_shared_accommodation_partner_link_rpc.sql', 'utf8'),
      fs.readFile('supabase/migrations/20260922173400_shared_accommodation_partner_ack_rpc.sql', 'utf8'),
    ]);
    const migration = schema + '\\n' + createRpc + '\\n' + linkRpc + '\\n' + partnerAck;
    expect(migration).toContain('recruitment_accommodation_shares');
    expect(migration).toContain('share_amount_eur');
    expect(migration).toContain('primary_staff_id');
    expect(migration).toContain('partner_staff_id');
    expect(migration).toContain('bimed_acknowledge_shared_accommodation_options');
    expect(migration).toContain('bimed_link_existing_shared_accommodation_partner');
    expect(migration).toContain('bimed_acknowledge_shared_accommodation_partner');
    expect(migration).toContain('recruitment_accommodation_shares');
    expect(migration).toContain('SHARED_PARTNER_ALREADY_SHARED');
    expect(migration).toContain('primary_invoice_id');
    expect(migration).toContain('partner_invoice_id');
    expect(migration).toContain("grant execute on function public.bimed_acknowledge_shared_accommodation_options");
  });


  it('keeps shared plans on the dedicated partner workflow and uses the selected primary permit route for the refund trigger', async () => {
    const [route, migration] = await Promise.all([
      fs.readFile('app/api/staff/permit/route.ts', 'utf8'),
      fs.readFile('supabase/migrations/20260922175000_shared_accommodation_refund_trigger_hardening.sql', 'utf8'),
    ]);
    expect(route).toContain('Shared accommodation plans must use the dedicated shared-accommodation workflow');
    expect(migration).toContain("when p_permit_submission_route = 'candidate_or_agency' and v_period = 1");
    expect(migration).toContain("where accommodation_plan = 'one_month_shared_625'");
  });


  it('provides an idempotent candidate-facing recovery path when one shared invoice fails to issue', async () => {
    const route = await fs.readFile('app/api/staff/permit/route.ts', 'utf8');
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');
    expect(route).toContain("if (action === 'retry_shared_accommodation_invoice_issuance')");
    expect(route).toContain('without creating duplicate invoices');
    expect(route).toContain('alreadyIssued: issuance.alreadyIssued === true');
    expect(page).toContain('Retry shared invoice issuance');
    expect(page).toContain('BILLING RECOVERY');
    expect(page).toContain('sharedBillingRecovery?.needsRecovery');
  });

  it('allows BIMED-assisted partner matching without requiring a partner identifier up front', async () => {
    const [migration, page] = await Promise.all([
      fs.readFile('supabase/migrations/20260924171045_fix_accommodation_selection_and_shared_match_20260924.sql', 'utf8'),
      fs.readFile('app/staff/permit/page.tsx', 'utf8'),
    ]);
    expect(migration).toContain('bimed_request_shared_accommodation_match');
    expect(migration).toContain("shared_match_status', 'pending_bimed_match'");
    expect(page).toContain('You do not need to know another BIMED candidate before selecting this plan.');
    expect(page).toContain('request_shared_accommodation_match');
  });

  it('locks shared invitees to the arrangement they were assigned', async () => {
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');
    expect(page).toContain('const sharedPartner = permit?.accommodation_share_role === \'partner\'');
    expect(page).toContain('disabled={planLocked || busy || sharedPartner}');
  });
});
