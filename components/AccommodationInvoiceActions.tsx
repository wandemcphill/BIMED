'use client';

import { useState } from 'react';

export default function AccommodationInvoiceActions({
  token,
  status,
  invoiceNumber,
}: {
  token: string;
  status: string;
  invoiceNumber: string;
}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  if (!['issued', 'payment_reported', 'cancellation_requested'].includes(status)) return null;

  async function act(action: 'payment_reported' | 'cancellation_requested') {
    setBusy(action);
    setMessage('');
    try {
      const response = await fetch('/api/invoices/accommodation/' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to complete this action.');
      if (action === 'payment_reported') {
        setMessage('Payment notice recorded. Please send your payment receipt to overseas@bimedhealthcare.com.');
        window.location.reload();
      } else {
        setMessage('Cancellation request recorded. BIMED billing has been notified for review.');
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete this action.');
    } finally {
      setBusy('');
    }
  }

  const mailto = 'mailto:overseas@bimedhealthcare.com?subject='
    + encodeURIComponent('Payment receipt - ' + invoiceNumber)
    + '&body='
    + encodeURIComponent('Please find attached my payment receipt for BIMED accommodation invoice ' + invoiceNumber + '.');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto 14px', background: '#fff', border: '1px solid #d9e2ec', borderRadius: 10, padding: 16 }}>
      <div style={{ fontWeight: 800, color: '#163247', marginBottom: 7 }}>Payment & invoice actions</div>
      <div style={{ color: '#627d98', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
        Pay the amount shown on the invoice using the official account details. After you make the transfer, click <strong>I have made payment</strong> and send your payment receipt to <strong>overseas@bimedhealthcare.com</strong>.
        {status === 'payment_reported' ? ' Your payment notice has already been recorded and is awaiting BIMED verification.' : ''}
        {status === 'cancellation_requested' ? ' Your cancellation request has already been recorded and is awaiting BIMED review.' : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {status === 'issued' && (
          <>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void act('payment_reported')}
              style={{ padding: '11px 16px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: busy ? .6 : 1 }}
            >
              {busy === 'payment_reported' ? 'Recording…' : 'I have made payment'}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void act('cancellation_requested')}
              style={{ padding: '11px 16px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', fontWeight: 800, cursor: 'pointer', opacity: busy ? .6 : 1 }}
            >
              {busy === 'cancellation_requested' ? 'Requesting…' : 'Request cancellation'}
            </button>
          </>
        )}
        {status === 'payment_reported' && (
          <a
            href={mailto}
            style={{ display: 'inline-block', padding: '11px 16px', border: '1px solid #0f766e', borderRadius: 9, background: '#fff', color: '#0f766e', fontWeight: 800, textDecoration: 'none' }}
          >
            Email payment receipt to BIMED
          </a>
        )}
      </div>
      {message && <div style={{ marginTop: 12, color: message.toLowerCase().includes('unable') ? '#9b2c2c' : '#166534', fontSize: 13 }}>{message}</div>}
    </div>
  );
}
