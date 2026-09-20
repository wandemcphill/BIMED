import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED accommodation billing lifecycle boundary', () => {
  it('keeps admin cancellation and legacy receipt issuance off direct permit-table writes', async () => {
    const route = await fs.readFile('app/api/admin/staff/[id]/billing/route.ts', 'utf8');

    expect(route).toContain("client.rpc('bimed_cancel_accommodation_invoice'");
    expect(route).toContain("client.rpc('bimed_issue_accommodation_receipt'");
    expect(route).not.toContain("from('recruitment_staff_permit_cases').update");
    expect(route).not.toContain('makeReceiptNumber');
  });

  it('provides service-role-only atomic billing reconciliation RPCs', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20260920_accommodation_billing_lifecycle_hardening.sql',
      'utf8',
    );

    expect(migration).toContain('bimed_cancel_accommodation_invoice');
    expect(migration).toContain('bimed_issue_accommodation_receipt');
    expect(migration).toContain('accommodation_payment_status = \'cancelled\'');
    expect(migration).toContain('accommodation_payment_status = \'paid_receipted\'');
    expect(migration).toContain(
      'revoke all on function public.bimed_cancel_accommodation_invoice',
    );
    expect(migration).toContain(
      'revoke all on function public.bimed_issue_accommodation_receipt',
    );
    expect(migration).toContain(
      'grant execute on function public.bimed_cancel_accommodation_invoice(uuid,text)',
    );
    expect(migration).toContain(
      'grant execute on function public.bimed_issue_accommodation_receipt(uuid,text,text)',
    );
  });
});
