import { describe, expect, it } from 'vitest';
import { invoiceHtml } from '@/lib/accommodation-documents';

describe('accommodation invoice payment details', () => {
  it('does not expose bank account details or an online payment link', () => {
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
        arrangement_snapshot: {
          accommodation_plan: 'three_months_4000',
          accommodation_amount_eur: 4000,
          accommodation_period_months: 3,
          permit_submission_route: 'bimed_legal_team',
          permit_type: 'general_employment_permit',
          permit_fee_eur: 1000,
          permit_duration_months: 24,
          terms_version: '2026-09-17-v2',
        },
        issue_date: '2026-09-18',
        issued_at: '2026-09-18T08:00:00.000Z',
        due_date: '2026-09-25',
      },
      staff: { full_name: 'Ada Byron', email: 'ada@example.com', bimed_id: 'BIM-2026-TEST' },
      publicUrl: 'https://recruitment.bimedhealthcare.com/invoices/accommodation/public-token',
    });

    expect(html).toContain('Payment details are not included on this invoice.');
    expect(html).toContain('manager@bimedhealthcare.com');
    expect(html).not.toContain('WEBGEEK TECHNOLOGIES LTD');
    expect(html).not.toContain('DE81202208000048523738');
    expect(html).not.toContain('SXPYDEHH');
    expect(html).not.toContain('00008988');
    expect(html).not.toContain('04-09-97');
    expect(html).not.toContain('payssion.com');
    expect(html).not.toContain('Pay online securely');
    expect(html).not.toContain('1–3 working days');
    expect(html).not.toContain('15 working days');
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
