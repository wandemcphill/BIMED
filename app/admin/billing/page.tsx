'use client';

import { useEffect, useMemo, useState } from 'react';
import { accommodationGbpEquivalent } from '@/lib/employment-permit-options';

type Row = {
  id: string;
  invoice_number: string;
  status: string;
  amount_eur: number;
  currency: string;
  bill_to_name: string;
  bill_to_email: string;
  created_at: string;
  issued_at?: string | null;
  payment_reported_at?: string | null;
  cancellation_requested_at?: string | null;
  cancellation_reason?: string | null;
  public_token: string;
  staff: { id: string; full_name: string; bimed_id: string; email: string };
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value);
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

const statusLabel: Record<string, string> = {
  draft: 'Invoice requested',
  issued: 'Issued / awaiting payment',
  payment_reported: 'Payment reported',
  cancellation_requested: 'Cancellation requested',
  paid: 'Paid / verified',
  cancelled: 'Cancelled',
};

export default function BillingQueuePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('actionable');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setError('');
    const response = await fetch('/api/admin/billing', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load invoice queue.'); return; }
    setRows(data.rows || []);
  }

  useEffect(() => { void load(); }, []);

  async function action(actionName: string, invoiceId: string) {
    setBusy(invoiceId + actionName);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: actionName, invoiceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed.');
      setMessage(actionName === 'issue_invoice'
        ? 'Invoice issued and sent to the candidate.'
        : actionName === 'mark_paid'
          ? 'Payment verified and receipt issued.'
          : 'Invoice cancelled.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const filtered = useMemo(() => {
    if (status === 'all') return rows;
    if (status === 'actionable') return rows.filter((row) => ['draft', 'issued', 'payment_reported', 'cancellation_requested'].includes(row.status));
    return rows.filter((row) => row.status === status);
  }, [rows, status]);

  const counts = useMemo(() => rows.reduce((acc: Record<string, number>, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {}), [rows]);

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', padding: 'clamp(16px,4vw,28px)', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <a href="/admin/permit" style={secondary}>← Overseas permits</a>
        <div style={{ marginTop: 14 }}>
          <div style={eyebrow}>OVERSEAS BILLING</div>
          <h1 style={{ margin: '4px 0' }}>Accommodation invoice queue</h1>
          <p style={muted}>Every accommodation request appears here. Legacy requests remain available for review and issue; new requests are issued automatically when the candidate confirms an accommodation package. GBP equivalents are indicative reference amounts.</p>
        </div>

        {error && <div style={{ ...notice, background: '#fff5f5', borderColor: '#fecaca', color: '#991b1b' }}>{error}</div>}
        {message && <div style={{ ...notice, background: '#ecfdf5', borderColor: '#bbf7d0', color: '#166534' }}>{message}</div>}

        <section style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['actionable', 'Actionable'],
              ['draft', `Requested (${counts.draft || 0})`],
              ['issued', `Issued (${counts.issued || 0})`],
              ['payment_reported', `Payment reported (${counts.payment_reported || 0})`],
              ['cancellation_requested', `Cancellation requests (${counts.cancellation_requested || 0})`],
              ['paid', `Paid (${counts.paid || 0})`],
              ['cancelled', `Cancelled (${counts.cancelled || 0})`],
              ['all', `All (${rows.length})`],
            ].map(([value, label]) => (
              <button key={value} onClick={() => setStatus(value)} style={{ ...filterButton, ...(status === value ? filterActive : {}) }}>{label}</button>
            ))}
          </div>
        </section>

        <section style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>{['Candidate', 'Invoice', 'Amount', 'Status', 'Requested / issued', 'Actions'].map((head) => <th key={head} style={th}>{head}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid #edf2f7' }}>
                    <td style={td}><strong>{row.staff.full_name}</strong><div style={small}>{row.staff.bimed_id} · {row.bill_to_email}</div></td>
                    <td style={td}><strong>{row.invoice_number}</strong><div style={small}><a href={`/invoices/accommodation/${row.public_token}`} target="_blank" rel="noreferrer">Open invoice ↗</a></div></td>
                    <td style={td}><strong>{money(Number(row.amount_eur), row.currency)}</strong><div style={small}>GBP equivalent: £{accommodationGbpEquivalent(Number(row.amount_eur)).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div></td>
                    <td style={td}><span style={pill}>{statusLabel[row.status] || row.status}</span>{row.cancellation_reason ? <div style={{ ...small, marginTop: 6 }}>Reason: {row.cancellation_reason}</div> : null}</td>
                    <td style={td}><div>{date(row.created_at)}</div>{row.issued_at ? <div style={small}>Issued {date(row.issued_at)}</div> : null}{row.payment_reported_at ? <div style={small}>Payment reported {date(row.payment_reported_at)}</div> : null}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {row.status === 'draft' && <button disabled={busy === row.id + 'issue_invoice'} onClick={() => void action('issue_invoice', row.id)} style={button}>{busy === row.id + 'issue_invoice' ? 'Issuing…' : 'Issue & send'}</button>}
                        {['payment_reported', 'cancellation_requested'].includes(row.status) && <a href={`/admin/permit/billing/${row.staff.id}`} style={secondary}>Open billing</a>}
                        {row.status === 'issued' && <a href={`/admin/permit/billing/${row.staff.id}`} style={secondary}>Open billing</a>}
                        {row.status === 'cancellation_requested' && <button disabled={busy === row.id + 'cancel_invoice'} onClick={() => void action('cancel_invoice', row.id)} style={dangerButton}>{busy === row.id + 'cancel_invoice' ? 'Cancelling…' : 'Cancel invoice'}</button>}
                        {row.status === 'payment_reported' && <button disabled={busy === row.id + 'mark_paid'} onClick={() => void action('mark_paid', row.id)} style={button}>{busy === row.id + 'mark_paid' ? 'Verifying…' : 'Mark paid'}</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#627d98' }}>No invoices in this queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', marginTop: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const secondary: React.CSSProperties = { display: 'inline-block', padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
const button: React.CSSProperties = { padding: '9px 12px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const dangerButton: React.CSSProperties = { padding: '9px 12px', border: 0, borderRadius: 9, background: '#b91c1c', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const filterButton: React.CSSProperties = { padding: '8px 11px', border: '1px solid #d9e2ec', borderRadius: 999, background: '#fff', color: '#334e68', fontWeight: 800 };
const filterActive: React.CSSProperties = { background: '#e6fffa', borderColor: '#0f766e', color: '#0f766e' };
const th: React.CSSProperties = { padding: 11, textAlign: 'left', background: '#f8fafc', color: '#627d98', fontSize: 12 };
const td: React.CSSProperties = { padding: 12, verticalAlign: 'top' };
const small: React.CSSProperties = { fontSize: 12, color: '#627d98', marginTop: 4 };
const pill: React.CSSProperties = { display: 'inline-block', padding: '5px 8px', borderRadius: 999, background: '#eff6ff', color: '#334e68', fontSize: 11, fontWeight: 900 };
const notice: React.CSSProperties = { marginTop: 14, padding: 12, border: '1px solid', borderRadius: 10 };
const muted: React.CSSProperties = { color: '#627d98', lineHeight: 1.6 };
const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: '#0f766e' };
