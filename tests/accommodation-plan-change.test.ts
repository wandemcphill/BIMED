import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('BIMED accommodation plan change flow', () => {
  it('exposes an unpaid-before-permit change action in the staff permit route', async () => {
    const route = await fs.readFile('app/api/staff/permit/route.ts', 'utf8');

    expect(route).toContain("if (action === 'change_accommodation_selection')");
    expect(route).toContain("permit.status !== 'not_started' || permit.requested_at");
    expect(route).toContain("!['draft', 'issued'].includes(currentInvoice.status)");
    expect(route).toContain("currentInvoice.paid_at || currentInvoice.payment_reported_at");
    expect(route).toContain("client.rpc('bimed_change_staff_accommodation_selection'");
    expect(route).toContain("The accommodation plan can only be changed before payment is reported or recorded.");
  });

  it('gives candidates an explicit change-plan control without reopening legacy cases', async () => {
    const page = await fs.readFile('app/staff/permit/page.tsx', 'utf8');

    expect(page).toContain('Change accommodation plan');
    expect(page).toContain('€4,000 for 3 months');
    expect(page).toContain('€1,250 for 1 month');
    expect(page).toContain("'one_month_shared_625'");
    expect(page).toContain('Shared accommodation plans are established through the dedicated shared-accommodation flow');
    expect(page).toContain("!selectedPlan || !acknowledged || selectedPlan === permit.accommodation_plan");
    expect(page).toContain("permit?.permit_submission_route");
    expect(page).toContain("['draft', 'issued'].includes(invoice.status)");
    expect(page).toContain('Your existing unpaid invoice will be superseded and a new invoice will be issued');
  });

  it('creates the replacement-selection database boundary as a service-role-only atomic operation', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20260922154500_shared_accommodation_plan_and_change_hardening.sql',
      'utf8',
    );

    expect(migration).toContain('bimed_change_staff_accommodation_selection');
    expect(migration).toContain("v_invoice.status not in ('draft','issued')");
    expect(migration).toContain("one_month_shared_625");
    expect(migration).toContain('INVALID_SHARED_ACCOMMODATION_SELECTION');
    expect(migration).toContain('v_invoice.paid_at is not null');
    expect(migration).toContain('v_invoice.payment_reported_at is not null');
    expect(migration).toContain("v_permit.status <> 'not_started'");
    expect(migration).toContain("v_previous_plan");
    expect(migration).toContain('accommodation_plan_changed');
    expect(migration).toContain('changed_from');
    expect(migration).toContain('revoke all on function public.bimed_change_staff_accommodation_selection');
    expect(migration).toContain('grant execute on function public.bimed_change_staff_accommodation_selection');
  });

  it('keeps the invoice one-to-one by replacing the current unpaid invoice instead of inserting a second invoice', async () => {
    const migration = await fs.readFile(
      'supabase/migrations/20260922150000_accommodation_plan_change_atomic.sql',
      'utf8',
    );

    expect(migration).toContain('update public.recruitment_accommodation_invoices');
    expect(migration).not.toContain('insert into public.recruitment_accommodation_invoices');
  });
});
