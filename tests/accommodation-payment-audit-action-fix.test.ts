import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('atomic accommodation payment audit action fix', () => {
  it('populates both required audit dimensions for payment and receipt events', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20261015194500_fix_accommodation_payment_audit_action.sql',
      'utf8',
    );

    expect(migration).toContain(
      'insert into public.recruitment_staff_audit_log(\n    staff_id,\n    action,\n    actor,\n    event_type,\n    metadata\n  )',
    );
    expect(migration).toContain("'accommodation_payment_recorded',\n      p_actor,\n      'accommodation_payment_recorded'");
    expect(migration).toContain(
      "'accommodation_payment_receipt_issued',\n      p_receipt_issued_by,\n      'accommodation_payment_receipt_issued'",
    );
  });

  it('accepts the two statuses exposed as payable by the admin billing route', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20261015194500_fix_accommodation_payment_audit_action.sql',
      'utf8',
    );

    expect(migration).toContain("if v_invoice.status not in ('issued', 'payment_reported') then");
    expect(migration).toContain(
      'grant execute on function public.bimed_record_accommodation_payment(uuid, text, text, text, text)',
    );
  });
});
