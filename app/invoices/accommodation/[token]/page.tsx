import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { invoiceHtml, receiptHtml, appUrl } from '@/lib/accommodation-documents';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ receipt?: string }> };

export default async function AccommodationInvoicePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { receipt: receiptMode } = await searchParams;
  const client = db();
  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('public_token', token).maybeSingle();
  if (!invoice || invoice.status === 'cancelled') notFound();
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('staff_id').eq('id', invoice.permit_case_id).maybeSingle();
  if (!permit) notFound();
  const { data: staff } = await client.from('recruitment_staff').select('full_name,bimed_id,email').eq('id', permit.staff_id).maybeSingle();
  if (!staff) notFound();
  const { data: receipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle();
  const publicUrl = `${appUrl()}/invoices/accommodation/${token}`;
  const html = receipt && receiptMode === '1'
    ? receiptHtml({ receipt, invoice, staff, publicUrl: `${publicUrl}?receipt=1` })
    : invoiceHtml({ invoice, staff, publicUrl });

  const actionPanel = !receipt && ['issued', 'payment_reported', 'cancellation_requested'].includes(invoice.status)
    ? <div style={{ maxWidth: 900, margin: '0 auto 14px', background: '#fff', border: '1px solid #d9e2ec', borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 800, color: '#163247', marginBottom: 7 }}>Payment & invoice actions</div>
        <div style={{ color: '#627d98', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
          Pay the amount shown on the invoice using the official account details. After you make the transfer, click <strong>I have made payment</strong> and send your payment receipt to <strong>overseas@bimedhealthcare.com</strong>.
          {invoice.status === 'payment_reported' ? ' Your payment notice has already been recorded and is awaiting BIMED verification.' : ''}
          {invoice.status === 'cancellation_requested' ? ' Your cancellation request has already been recorded and is awaiting BIMED review.' : ''}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {invoice.status === 'issued' ? <button data-invoice-action="payment_reported" data-token={token} style={{ padding: '11px 16px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>I have made payment</button> : null}
          {invoice.status === 'issued' ? <button data-invoice-action="cancellation_requested" data-token={token} style={{ padding: '11px 16px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', fontWeight: 800, cursor: 'pointer' }}>Request cancellation</button> : null}
          {invoice.status === 'payment_reported' ? <a href={\`mailto:overseas@bimedhealthcare.com?subject=Payment%20receipt%20-%20\${encodeURIComponent(invoice.invoice_number)}&body=Please%20find%20attached%20my%20payment%20receipt%20for%20BIMED%20accommodation%20invoice%20\${encodeURIComponent(invoice.invoice_number)}.\`} style={{ display: 'inline-block', padding: '11px 16px', border: '1px solid #0f766e', borderRadius: 9, background: '#fff', color: '#0f766e', fontWeight: 800, textDecoration: 'none' }}>Email payment receipt to BIMED</a> : null}
        </div>
        <div id="invoice-action-message" style={{ marginTop: 12, color: '#166534', fontSize: 13 }} />
      </div>
    : null;

  return <main style={{ minHeight: '100vh', background: '#eef2f5', padding: 20, fontFamily: 'Arial,sans-serif' }}>
    <div style={{ maxWidth: 900, margin: '0 auto' }}>{actionPanel}
      <div style={{ padding: '10px 14px', marginBottom: 14, background: '#fff', border: '1px solid #d9e2ec', borderRadius: 8, color: '#627d98', fontSize: 13 }}>Use your browser Print command and choose <strong>Save as PDF</strong> to keep a PDF copy. {receipt && receiptMode !== '1' ? <a href={`${publicUrl}?receipt=1`} style={{ marginLeft: 12, fontWeight: 800 }}>View payment receipt</a> : null}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
    <script dangerouslySetInnerHTML={{ __html: `
      document.querySelectorAll('[data-invoice-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const el = button;
          const action = el.getAttribute('data-invoice-action');
          const tokenValue = el.getAttribute('data-token');
          const message = document.getElementById('invoice-action-message');
          if (!action || !tokenValue || !message) return;
          el.disabled = true;
          el.textContent = 'Please wait…';
          try {
            const response = await fetch('/api/invoices/accommodation/' + encodeURIComponent(tokenValue), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to complete this action.');
            message.textContent = action === 'payment_reported'
              ? 'Payment notice recorded. Please send your payment receipt to overseas@bimedhealthcare.com.'
              : 'Cancellation request recorded. BIMED billing has been notified for review.';
            window.setTimeout(() => window.location.reload(), 600);
          } catch (error) {
            message.style.color = '#9b2c2c';
            message.textContent = error instanceof Error ? error.message : 'Unable to complete this action.';
            el.disabled = false;
            el.textContent = action === 'payment_reported' ? 'I have made payment' : 'Request cancellation';
          }
        });
      });
    ` }} />
  </main>;
}
