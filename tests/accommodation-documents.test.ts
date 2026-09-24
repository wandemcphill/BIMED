import { describe, expect, it } from 'vitest';
import { ACCOMMODATION_PAYMENT_ACCOUNT } from '@/lib/accommodation-billing';
import { invoiceHtml } from '@/lib/accommodation-documents';

describe('accommodation invoice payment details', () => {
  it('includes the canonical account details when an invoice has no snapshot', () => {
    const html = invoiceHtml({
      invoice: {
        invoice_number: 'BIMED-ACC-2026-TEST',
        public_token: 'public-token',
        status: 'issued',
        amount_eur: 4000,
        currency: 'EUR',
        description: 'BIMED-arranged accommodation',
        bill_to_name: 'Ada Byron',
        bill_to_email: 'ada@example.com',
        payment_account_snapshot: {},
        issue_date: '2026-09-18',
        issued_at: '2026-09-18T08:00:00.000Z',
        due_date: '2026-09-25',
      },
      staff: { full_name: 'Ada Byron', email: 'ada@example.com', bimed_id: 'BIM-2026-TEST' },
      publicUrl: 'https://recruitment.bimedhealthcare.com/invoices/accommodation/public-token',
    });

    expect(html).toContain(ACCOMMODATION_PAYMENT_ACCOUNT.account_name);
    expect(html).toContain(ACCOMMODATION_PAYMENT_ACCOUNT.iban);
    expect(html).toContain(ACCOMMODATION_PAYMENT_ACCOUNT.bic_swift);
    expect(html).toContain(ACCOMMODATION_PAYMENT_ACCOUNT.account_number);
    expect(html).toContain(ACCOMMODATION_PAYMENT_ACCOUNT.sort_code);
    expect(html).toContain('https://www.payssion.com/checkout/live_d5a43be9bff6d1a2');
    expect(html).toContain('href="https://www.payssion.com/checkout/live_d5a43be9bff6d1a2"');
    expect(html).toContain('Pay online securely');
  });
  it('renders the selected one-month shared €625 terms instead of the legacy €4,000 terms', async () => {
    const { invoiceHtml } = await import('@/lib/accommodation-billing');
    const html = invoiceHtml({
      invoice: {
        invoice_number: 'BIMED-ACC-2026-SHARED',
        public_token: 'shared-token',
        status: 'issued',
        amount_eur: 625,
        currency: 'EUR',
        description: 'BIMED-arranged shared accommodation for the first month',
        bill_to_name: 'Ghizlan Azzouzi',
        bill_to_email: 'ghizlan.azzouzi@bimedhealthcare.com',
        payment_account_snapshot: {},
        arrangement_snapshot: {
          accommodation_plan: 'one_month_shared_625',
          accommodation_amount_eur: 625,
          accommodation_period_months: 1,
          accommodation_refund_installments: 4,
          accommodation_refund_trigger: 'successful_three_month_probation',
        },
        issue_date: '2026-09-22',
        issued_at: '2026-09-22T14:00:00.000Z',
        due_date: '2026-09-29',
      },
      staff: { full_name: 'Ghizlan Azzouzi', email: 'ghizlan.azzouzi@bimedhealthcare.com', bimed_id: 'BH-001030' },
      publicUrl: 'https://recruitment.bimedhealthcare.com/invoices/accommodation/shared-token',
    });

    expect(html).toContain('€625 payment covers BIMED-arranged shared accommodation');
    expect(html).not.toContain('€4,000 payment covers BIMED-arranged accommodation');
  });

  it('shows the shared arrangement reference and half-share on the invoice document', () => {
    const html = invoiceHtml({
      invoice: {
        invoice_number: 'BIMED-ACC-SHARED-TEST',
        public_token: 'shared-token',
        status: 'issued',
        amount_eur: 2000,
        currency: 'EUR',
        description: 'BIMED-arranged shared accommodation for the initial three-month probationary period — your 50% share',
        bill_to_name: 'Ada Shared',
        bill_to_email: 'ada@example.com',
        payment_account_snapshot: {},
        arrangement_snapshot: {
          shared: true,
          accommodation_plan: 'three_months_shared_2000',
          accommodation_amount_eur: 2000,
          accommodation_period_months: 3,
          total_amount_eur: 4000,
          share_amount_eur: 2000,
          share_reference: 'BIMED-SHARE-TEST1234',
          share_role: 'primary',
          partner_bimed_id: 'BH-002000',
          partner_name: 'Partner Candidate',
          partner_email: 'partner@example.com',
          accommodation_refund_trigger: 'successful_three_month_probation',
          permit_submission_route: 'bimed_legal_team',
          permit_type: 'general_employment_permit',
          permit_fee_eur: 1000,
          permit_duration_months: 24,
          terms_version: '2026-09-17-v2',
        },
        issue_date: '2026-09-22',
        issued_at: '2026-09-22T15:00:00.000Z',
        due_date: '2026-09-29',
      },
      staff: { full_name: 'Ada Shared', email: 'ada@example.com', bimed_id: 'BH-001999' },
      publicUrl: 'https://recruitment.bimedhealthcare.com/invoices/accommodation/shared-token',
    });

    expect(html).toContain('50% share');
    expect(html).toContain('BIMED-SHARE-TEST1234');
    expect(html).toContain('€4,000.00');
    expect(html).toContain('Partner Candidate');
  });

});
