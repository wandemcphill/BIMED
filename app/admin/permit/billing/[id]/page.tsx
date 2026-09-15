'use client';

import { useEffect, useState } from 'react';

export default function AccommodationBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [sendEmail, setSendEmail] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank transfer');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(caseId: string) {
    const response = await fetch(`/api/admin/staff/${caseId}/billing`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Unable to load billing.'); return; }
    setData(result);
    if (result.account) setForm(result.account);
    if (result.staff?.email) setSendEmail(result.staff.email);
  }

  useEffect(() => { void params.then(({ id: nextId }) => { setId(nextId); void load(nextId); }); }, [params]);

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    setError(''); setMessage('');
    const response = await fetch(`/api/admin/staff/${id}/billing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName, ...extra }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'Action failed.'); return; }
    setMessage(actionName === 'mark_paid' ? 'Payment recorded and the professional receipt was generated automatically.' : 'Saved.');
    await load(id);
    return result;
  }

  if (!data) return <main style={{ padding: 30, fontFamily: 'system-ui' }}>Loading billing workspace…</main>;
  const invoice = data.invoice;
  const receipt = data.receipt;

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 'clamp(16px,4vw,28px)', fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      <a href='/admin/permit' style={secondary}>← Overseas permits</a>
      <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED BILLING</div><h1 style={{ margin: '4px 0' }}>Accommodation billing</h1><p style={{ color: '#627d98', marginTop: 4 }}>{data.staff.full_name} · {data.staff.bimed_id} · €4,000 accommodation arrangement</p></div>
      {error && <div style={{ ...notice, color: '#9b2c2c', background: '#fff5f5', border: '1px solid #fed7d7' }}>{error}</div>}
      {message && <div style={{ ...notice, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>{message}</div>}

      <section style={card}><div style={sectionHeading}><div><h2 style={{ margin: 0 }}>Candidate acknowledgement</h2><p style={muted}>The invoice carries the same versioned accommodation terms acknowledged by the new hire.</p></div></div><div style={grid}><Info label='Terms acknowledged' value={data.permit.accommodation_terms_acknowledged_at ? `Yes · ${data.permit.accommodation_terms_acknowledged_at}` : 'Not yet'} /><Info label='Terms version' value={data.permit.accommodation_terms_version || '—'} /><Info label='Invoice request' value={data.permit.accommodation_invoice_requested_at ? 'Requested' : 'Not requested'} /><Info label='Signatory' value='Dezou Maurice · Manager' /></div></section>

      <section style={card}><h2 style={{ marginTop: 0 }}>Payment account details</h2><p style={muted}>The active account snapshot is copied into each issued invoice so later bank-detail changes do not rewrite historical invoices.</p><div style={grid}>{[['Account name', 'account_name', true], ['Bank name', 'bank_name', true], ['IBAN', 'iban'], ['BIC / SWIFT', 'bic_swift'], ['Account number', 'account_number'], ['Sort code', 'sort_code'], ['Branch details', 'branch_details'], ['Payment reference instructions', 'payment_reference_instructions']].map(([label, key, required]) => <Field key={String(key)} label={String(label)} value={form[key as string] || ''} onChange={(v) => setForm({ ...form, [key as string]: v })} required={Boolean(required)} />)}</div><button onClick={() => void action('save_account', form)} style={button}>Save payment account</button></section>

      <section style={card}><div style={sectionHeading}><div><h2 style={{ margin: 0 }}>Invoice</h2><p style={muted}>Issuance automatically applies Dezou Maurice's authorisation and the issuance date.</p></div>{invoice?.status && <span style={statusBadge(invoice.status)}>{invoice.status}</span>}</div>{invoice ? <><div style={grid}><Info label='Invoice number' value={invoice.invoice_number} /><Info label='Amount' value={`€${Number(invoice.amount_eur).toFixed(2)} ${invoice.currency}`} /><Info label='Issue date' value={invoice.issued_at || invoice.issue_date || '—'} /><Info label='Due date' value={invoice.due_date || 'On receipt'} /></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>{invoice.status === 'draft' && <button onClick={() => void action('issue_invoice')} style={button}>Issue signed invoice</button>}{['issued', 'paid'].includes(invoice.status) && <a href={`/invoices/accommodation/${invoice.public_token}`} target='_blank' rel='noreferrer' style={secondary}>Open professional invoice</a>}{invoice.status === 'issued' && <><input value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder='Recipient email' style={{ ...input, width: 300, maxWidth: '100%' }} /><button onClick={() => void action('send_invoice', { email: sendEmail })} style={button}>Send invoice</button></>}</div></> : <p style={{ color: '#9b2c2c' }}>No invoice request has been created yet. The new hire must acknowledge the arrangement first.</p>}</section>

      <section style={card}><div style={sectionHeading}><div><h2 style={{ margin: 0 }}>Payment and receipt</h2><p style={muted}>The receipt is automatically generated and signed by Dezou Maurice when payment is confirmed.</p></div></div>{invoice?.status === 'issued' ? <div style={grid}><Field label='Payment reference' value={paymentReference} onChange={setPaymentReference} /><Field label='Payment method' value={paymentMethod} onChange={setPaymentMethod} /><div style={{ alignSelf: 'end' }}><button onClick={() => void action('mark_paid', { payment_reference: paymentReference, payment_method: paymentMethod })} style={button}>Confirm payment & issue receipt</button></div></div> : null}{invoice?.status === 'paid' ? <><div style={grid}><Info label='Paid at' value={invoice.paid_at} /><Info label='Payment reference' value={invoice.payment_reference || '—'} /><Info label='Payment method' value={invoice.payment_method || '—'} /><Info label='Receipt number' value={receipt?.receipt_number || 'Legacy payment: receipt pending'} /></div>{receipt ? <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}><a href={`/invoices/accommodation/${invoice.public_token}?receipt=1`} target='_blank' rel='noreferrer' style={secondary}>Open professional receipt</a></div> : <button onClick={() => void action('issue_receipt')} style={button}>Generate missing receipt</button>}</> : <div style={pendingBox}>Once payment is confirmed, BIMED records the payment time automatically and generates the signed receipt.</div>}</section>
    </div>
  </main>;
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) { return <label style={{ display: 'block', minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#627d98', marginBottom: 5 }}>{label}{required ? ' *' : ''}</div><input value={value} onChange={(e) => onChange(e.target.value)} style={input} /></label>; }
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '10px 0', borderBottom: '1px solid #edf2f7', minWidth: 0 }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{String(value ?? '—')}</div></div>; }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(16px,3vw,22px)', marginTop: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 };
const sectionHeading: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' };
const button: React.CSSProperties = { marginTop: 14, padding: '11px 14px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondary: React.CSSProperties = { display: 'inline-block', padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
const notice: React.CSSProperties = { marginTop: 14, padding: 12, borderRadius: 10 };
const muted: React.CSSProperties = { color: '#627d98', lineHeight: 1.55, margin: '6px 0 0' };
const pendingBox: React.CSSProperties = { marginTop: 12, padding: 14, borderRadius: 11, background: '#f8fafc', color: '#627d98', border: '1px solid #e5eaf0', lineHeight: 1.55 };
function statusBadge(value: string): React.CSSProperties { return { padding: '6px 9px', borderRadius: 999, background: value === 'paid' ? '#ecfdf5' : value === 'issued' ? '#eff6ff' : '#f8fafc', border: '1px solid #dbe5eb', color: '#334e68', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }; }
