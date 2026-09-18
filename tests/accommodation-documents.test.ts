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
  });
});
