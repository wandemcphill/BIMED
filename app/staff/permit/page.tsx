'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Permit = Record<string, any>;

export default function StaffPermitPage() {
  const router = useRouter();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [packet, setPacket] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/staff/permit', { cache: 'no-store' });
    const data = await response.json();
    if (response.status === 401) { router.replace('/staff/login'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load the permit workspace.'); return; }
    setPermit(data.permit); setPacket(data.packet); setInvoice(data.invoice); setInvoiceUrl(data.invoiceUrl);
  }
  useEffect(() => { void load(); }, []);

  async function requestJourney() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_sponsorship' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit the request.');
      setPermit(data.permit);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit the request.'); }
    finally { setBusy(false); }
  }

  async function acknowledgeAccommodation() {
    if (!acknowledged) { setError('Please confirm that you understand the compulsory accommodation payment, refund and accommodation terms.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_accommodation', acknowledged: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to record your acknowledgement.');
      setPermit(data.permit);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record your acknowledgement.'); }
    finally { setBusy(false); }
  }

  if (error && !permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}><h1>Employment permit & sponsorship</h1><p style={{ color: '#9b2c2c' }}>{error}</p><button onClick={() => router.push('/staff')} style={button}>Back to Staff Portal</button></main>;
  if (!permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Loading employment permit workspace…</main>;

  const termsAcknowledged = Boolean(permit.accommodation_terms_acknowledged_at);

  return <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 'clamp(16px,4vw,28px)' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={secondary}>← Staff Portal</button>
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>OVERSEAS EMPLOYMENT</div><h1 style={{ margin: '4px 0', fontSize: 'clamp(30px,6vw,44px)', lineHeight: 1.08 }}>Employment permit & sponsorship</h1><p style={{ color: '#627d98', fontSize: 'clamp(16px,2.5vw,20px)', lineHeight: 1.6 }}>This workspace lets you ask BIMED to begin the employer-side employment permit journey and keeps the information needed for the next steps in one place.</p></div>
      <div style={{ ...card, marginTop: 18, borderColor: permit.work_authorised ? '#a7f3d0' : '#fde68a', background: permit.work_authorised ? '#ecfdf5' : '#fffbeb' }}><strong>{permit.work_authorised ? 'Work authorisation confirmed' : 'Work is not yet authorised'}</strong><p style={{ margin: '6px 0 0', color: '#627d98', lineHeight: 1.65 }}>{permit.work_authorised ? 'Your shift eligibility can be enabled by BIMED subject to normal rota requirements.' : 'You may use the Staff Portal for onboarding and immigration preparation, but you must not take shifts until BIMED confirms that you have the required permission to work in Ireland.'}</p></div>
      {error && <div style={{ ...card, marginTop: 14, color: '#9b2c2c' }}>{error}</div>}

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Your permit journey</h2><Info label='Current status' value={permit.status.replaceAll('_', ' ')} /><Info label='Permit type' value={permit.permit_type || 'BIMED to confirm'} /><Info label='Permit application ID' value={permit.permit_application_id || 'Not submitted yet'} /><Info label='Visa status' value={permit.visa_status || 'Not started'} />
      {permit.status === 'not_started' ? <button disabled={busy} onClick={() => void requestJourney()} style={{ ...button, width: '100%', maxWidth: 620 }}>{busy ? 'Submitting…' : 'Apply to BIMED for employment permit / sponsorship'}</button> : <div style={{ marginTop: 14, color: '#627d98' }}>Your request has been received. BIMED will review the complete profile and prepare the employer-side documents.</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Travel to Ireland</h2><p style={{ color: '#627d98', lineHeight: 1.65 }}>Prepare your planned home-country departure, passenger details and Dublin arrival date. BIMED will arrange the actual flight booking after immigration clearance. Supplier fare information is not shown in the Staff Portal.</p><button onClick={() => router.push('/staff/travel')} style={{ ...button, width: '100%', maxWidth: 420 }}>Open Dublin flight planning</button></section>

      <section style={{ ...card, marginTop: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><div><div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 900, fontSize: 12 }}>COMPULSORY BIMED ARRANGEMENT</div><h2 style={{ margin: '10px 0 8px' }}>Accommodation payment</h2></div><div style={{ fontSize: 22, fontWeight: 900, color: '#0f766e', whiteSpace: 'nowrap' }}>€4,000</div></div><p style={{ lineHeight: 1.7, marginTop: 0 }}>BIMED requires the €4,000 accommodation payment for the initial three-month probationary period. This is a compulsory condition of the BIMED overseas-hire accommodation arrangement, not an optional add-on.</p><p style={{ lineHeight: 1.7, color: '#627d98' }}>BIMED's recruitment and visa team advises that arranging accommodation in advance is intended to reduce the large personal funds a new hire would otherwise need to demonstrate, and that having accommodation secured can help BIMED progress the employment-permit and visa applications more efficiently. It does not guarantee approval by an Irish authority and does not remove any evidence that the authorities may still require.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}><Info label='Accommodation period' value={`${permit.accommodation_period_months || 3} months`} /><Info label='Amount payable' value={`€${Number(permit.accommodation_amount_eur || 4000).toFixed(2)}`} /><Info label='Refund arrangement' value={`€${Number(permit.accommodation_refund_amount_eur || 4000).toFixed(2)} after qualifying refusal or, after successful probation, in ${permit.accommodation_refund_installments || 4} weekly instalments`} /></div><div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#f8fafc', color: '#627d98', lineHeight: 1.65 }}><strong style={{ color: '#334e68' }}>Important:</strong> the €4,000 payment is compulsory under BIMED's overseas-hire accommodation arrangement. The arrangement is documented separately from the employment permit and visa decision. The refund timing and conditions are set out in the accommodation terms and subsequent invoice.</div>{!termsAcknowledged ? <div style={{ marginTop: 18, padding: 18, border: '1px solid #d9e2ec', borderRadius: 12 }}><label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#334e68', lineHeight: 1.6 }}><input type='checkbox' checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} /><span>I understand that the €4,000 payment for three months of BIMED-arranged accommodation is compulsory for my overseas hire, and I have read and understood the payment, refund and accommodation terms.</span></label><button disabled={busy || !acknowledged} onClick={() => void acknowledgeAccommodation()} style={{ ...button, width: '100%', maxWidth: 620, opacity: busy || !acknowledged ? 0.55 : 1 }}>{busy ? 'Recording…' : 'Acknowledge compulsory arrangement and request invoice'}</button></div> : <div style={{ marginTop: 18, padding: 16, borderRadius: 12, background: '#ecfdf5', color: '#166534' }}><strong>Accommodation terms acknowledged</strong><div style={{ marginTop: 5, fontSize: 13 }}>Acknowledged on {permit.accommodation_terms_acknowledged_at}. BIMED has notified overseas recruitment and the manager. The invoice is now in the billing workflow.</div>{invoice && invoiceUrl && ['issued','paid'].includes(invoice.status) ? <a href={invoiceUrl} target='_blank' rel='noreferrer' style={{ ...secondary, display: 'inline-block', marginTop: 12 }}>Open accommodation invoice</a> : <div style={{ marginTop: 10, color: '#627d98' }}>The invoice is being prepared. You will receive the issued invoice once BIMED has confirmed the payment account details.</div>}</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Information BIMED will use</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}><div><h3>Employee</h3><Info label='Full name' value={packet?.employee?.full_name} /><Info label='Nationality' value={packet?.employee?.nationality} /><Info label='Date of birth' value={packet?.employee?.date_of_birth} /><Info label='Phone' value={packet?.employee?.phone} /><Info label='Address' value={packet?.employee?.residential_address} /></div><div><h3>Employment</h3><Info label='Employer' value={packet?.employment?.employer} /><Info label='Position' value={packet?.employment?.position} /><Info label='Start date' value={packet?.employment?.start_date} /><Info label='Salary' value={packet?.employment?.annual_salary_eur ? `€${packet.employment.annual_salary_eur.toLocaleString()}` : 'To be confirmed'} /></div></div></section>

      <section style={{ ...card, marginTop: 18, marginBottom: 30 }}><h2 style={{ marginTop: 0 }}>What happens next</h2><ol style={{ lineHeight: 1.8, color: '#334e68', paddingLeft: 22 }}><li>Acknowledge the compulsory €4,000 accommodation arrangement.</li><li>BIMED automatically notifies overseas recruitment and the manager that you have requested the accommodation invoice.</li><li>BIMED enters the payment account details and issues the professional invoice.</li><li>After payment is confirmed, BIMED records the payment and can issue a professional payment receipt.</li><li>BIMED continues the employer-side permit/sponsorship process using your complete profile and supporting evidence.</li><li>Your virtual flight itinerary is sent to Overseas Recruitment through BIMED Messages so the future booking can use current details.</li><li>Shift access stays blocked until the required permission to work is confirmed.</li></ol></section>
    </div>
  </main>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(16px,3vw,20px)', boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const button: React.CSSProperties = { marginTop: 14, padding: '12px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 };
const secondary: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7', minWidth: 0 }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{String(value || '—')}</div></div>; }
