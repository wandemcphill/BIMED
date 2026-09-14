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
    setMessage('Saved.');
    await load(id);
    return result;
  }

  if (!data) return <main style={{ padding: 30, fontFamily: 'system-ui' }}>Loading billing workspace…</main>;
  const invoice = data.invoice;
  const receipt = data.receipt;

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 28, fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <a href='/admin/permit' style={secondary}>← Overseas permits</a>
      <h1 style={{ marginBottom: 4 }}>Accommodation billing</h1>
      <p style={{ color: '#627d98' }}>{data.staff.full_name} · {data.staff.bimed_id} · €4,000 accommodation arrangement</p>
      {error && <div style={{ ...notice, color: '#9b2c2c', background: '#fff5f5' }}>{error}</div>}
      {message && <div style={{ ...notice, color: '#166534', background: '#f0fdf4' }}>{message}</div>}

      <section style={card}><h2>Candidate acknowledgement</h2><Info label='Terms acknowledged' value={data.permit.accommodation_terms_acknowledged_at ? `Yes · ${data.permit.accommodation_terms_acknowledged_at}` : 'Not yet'} /><Info label='Terms version' value={data.permit.accommodation_terms_version || '—'} /><Info label='Invoice request' value={data.permit.accommodation_invoice_requested_at ? 'Requested' : 'Not requested'} /></section>

      <section style={card}><h2>Payment account details</h2><p style={{ color: '#627d98' }}>The active account snapshot is copied into each issued invoice so later bank-detail changes do not rewrite historical invoices.</p><div style={grid}><Field label='Account name' value={form.account_name || ''} onChange={(v) => setForm({ ...form, account_name: v })} required /><Field label='Bank name' value={form.bank_name || ''} onChange={(v) => setForm({ ...form, bank_name: v })} required /><Field label='IBAN' value={form.iban || ''} onChange={(v) => setForm({ ...form, iban: v })} /><Field label='BIC / SWIFT' value={form.bic_swift || ''} onChange={(v) => setForm({ ...form, bic_swift: v })} /><Field label='Account number' value={form.account_number || ''} onChange={(v) => setForm({ ...form, account_number: v })} /><Field label='Sort code' value={form.sort_code || ''} onChange={(v) => setForm({ ...form, sort_code: v })} /><Field label='Branch details' value={form.branch_details || ''} onChange={(v) => setForm({ ...form, branch_details: v })} /><Field label='Payment reference instructions' value={form.payment_reference_instructions || ''} onChange={(v) => setForm({ ...form, payment_reference_instructions: v })} /></div><button onClick={() => void action('save_account', form)} style={button}>Save payment account</button></section>

      <section style={card}><h2>Invoice</h2>{invoice ? <><Info label='Invoice number' value={invoice.invoice_number} /><Info label='Status' value={invoice.status} /><Info label='Amount' value={`€${Number(invoice.amount_eur).toFixed(2)} ${invoice.currency}`} /><Info label='Due date' value={invoice.due_date || 'On receipt'} /><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>{invoice.status === 'draft' && <button onClick={() => void action('issue_invoice')} style={button}>Issue invoice</button>}{['issued','paid'].includes(invoice.status) && <a href={`/invoices/accommodation/${invoice.public_token}`} target='_blank' rel='noreferrer' style={secondary}>Open invoice</a>}{invoice.status === 'issued' && <><input value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder='Recipient email' style={input} /><button onClick={() => void action('send_invoice', { email: sendEmail })} style={button}>Send invoice</button></> }</div></> : <p style={{ color: '#9b2c2c' }}>No invoice request has been created yet. The new hire must acknowledge the arrangement first.</p>}</section>

      <section style={card}><h2>Payment and receipt</h2>{invoice?.status === 'issued' ? <div style={grid}><Field label='Payment reference' value={paymentReference} onChange={setPaymentReference} /><Field label='Payment method' value={paymentMethod} onChange={setPaymentMethod} /><div style={{ alignSelf: 'end' }}><button onClick={() => void action('mark_paid', { payment_reference: paymentReference, payment_method: paymentMethod })} style={button}>Record payment</button></div></div> : null}{invoice?.status === 'paid' ? <><Info label='Paid at' value={invoice.paid_at} /><Info label='Payment reference' value={invoice.payment_reference || '—'} /><Info label='Payment method' value={invoice.payment_method || '—'} />{receipt ? <><Info label='Receipt number' value={receipt.receipt_number} /><a href={`/invoices/accommodation/${invoice.public_token}?receipt=1`} target='_blank' rel='noreferrer' style={secondary}>Open professional receipt</a></> : <button onClick={() => void action('issue_receipt')} style={button}>Issue professional receipt</button>}</> : <p style={{ color: '#627d98' }}>Once payment is confirmed, admin can record the payment and issue the professional receipt from this workspace.</p>}</section>
    </div>
  </main>;
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) { return <label style={{ display: 'block' }}><div style={{ fontSize: 12, fontWeight: 800, color: '#627d98', marginBottom: 5 }}>{label}{required ? ' *' : ''}</div><input value={value} onChange={(e) => onChange(e.target.value)} style={input} /></label>; }
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7' }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700 }}>{String(value ?? '—')}</div></div>; }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, marginTop: 18, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' };
const button: React.CSSProperties = { marginTop: 14, padding: '10px 14px', border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', fontWeight: 800 };
const secondary: React.CSSProperties = { display: 'inline-block', padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
const notice: React.CSSProperties = { marginTop: 14, padding: 12, borderRadius: 10 };
