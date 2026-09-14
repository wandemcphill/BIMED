'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Permit = Record<string, any>;

export default function StaffPermitPage() {
  const router = useRouter();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [packet, setPacket] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/staff/permit', { cache: 'no-store' });
    const data = await response.json();
    if (response.status === 401) { router.replace('/staff/login'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load the permit workspace.'); return; }
    setPermit(data.permit); setPacket(data.packet);
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

  if (error && !permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}><h1>Employment permit & sponsorship</h1><p style={{ color: '#9b2c2c' }}>{error}</p><button onClick={() => router.push('/staff')} style={button}>Back to Staff Portal</button></main>;
  if (!permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Loading employment permit workspace…</main>;

  return <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 28 }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={secondary}>← Staff Portal</button>
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>OVERSEAS EMPLOYMENT</div><h1 style={{ margin: '4px 0' }}>Employment permit & sponsorship</h1><p style={{ color: '#627d98' }}>This workspace lets you ask BIMED to begin the employer-side employment permit journey and keeps the information needed for the next steps in one place.</p></div>
      <div style={{ ...card, marginTop: 18, borderColor: permit.work_authorised ? '#a7f3d0' : '#fde68a', background: permit.work_authorised ? '#ecfdf5' : '#fffbeb' }}><strong>{permit.work_authorised ? 'Work authorisation confirmed' : 'Work is not yet authorised'}</strong><p style={{ margin: '6px 0 0', color: '#627d98' }}>{permit.work_authorised ? 'Your shift eligibility can be enabled by BIMED subject to normal rota requirements.' : 'You may use the Staff Portal for onboarding and immigration preparation, but you must not take shifts until BIMED confirms that you have the required permission to work in Ireland.'}</p></div>
      {error && <div style={{ ...card, marginTop: 14, color: '#9b2c2c' }}>{error}</div>}

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Your permit journey</h2><Info label='Current status' value={permit.status.replaceAll('_', ' ')} /><Info label='Permit type' value={permit.permit_type || 'BIMED to confirm'} /><Info label='Permit application ID' value={permit.permit_application_id || 'Not submitted yet'} /><Info label='Visa status' value={permit.visa_status || 'Not started'} />
      {permit.status === 'not_started' ? <button disabled={busy} onClick={() => void requestJourney()} style={button}>{busy ? 'Submitting…' : 'Apply to BIMED for employment permit / sponsorship'}</button> : <div style={{ marginTop: 14, color: '#627d98' }}>Your request has been received. BIMED will review the complete profile and prepare the employer-side documents.</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>BIMED accommodation offer</h2><p>BIMED records an accommodation offer for your initial three-month probationary period as part of the employment onboarding and immigration evidence package.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}><Info label='Accommodation period' value={`${permit.accommodation_period_months || 3} months`} /><Info label='Accommodation amount' value={`€${Number(permit.accommodation_amount_eur || 4000).toFixed(2)}`} /><Info label='Refund plan' value={`€${Number(permit.accommodation_refund_amount_eur || 4000).toFixed(2)} in ${permit.accommodation_refund_installments || 4} weekly instalments after probation, subject to the agreed terms`} /></div><div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#f8fafc', color: '#627d98', lineHeight: 1.6 }}><strong style={{ color: '#334e68' }}>Important immigration note:</strong> accommodation evidence may support an application, but it does not guarantee an employment permit or visa and does not automatically replace any financial evidence required by Irish immigration authorities.</div><div style={{ marginTop: 12, color: '#627d98' }}>If the permit/visa journey is refused, the portal records the agreed full refund arrangement. Keep all payment and accommodation documentation.</div></section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Information BIMED will use</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}><div><h3>Employee</h3><Info label='Full name' value={packet?.employee?.full_name} /><Info label='Nationality' value={packet?.employee?.nationality} /><Info label='Date of birth' value={packet?.employee?.date_of_birth} /><Info label='Phone' value={packet?.employee?.phone} /><Info label='Address' value={packet?.employee?.residential_address} /></div><div><h3>Employment</h3><Info label='Employer' value={packet?.employment?.employer} /><Info label='Position' value={packet?.employment?.position} /><Info label='Start date' value={packet?.employment?.start_date} /><Info label='Salary' value={packet?.employment?.annual_salary_eur ? `€${packet.employment.annual_salary_eur.toLocaleString()}` : 'To be confirmed'} /></div></div></section>

      <section style={{ ...card, marginTop: 18, marginBottom: 30 }}><h2 style={{ marginTop: 0 }}>What happens next</h2><ol style={{ lineHeight: 1.8, color: '#334e68' }}><li>Submit your request to BIMED from this page.</li><li>BIMED checks your complete profile, employment terms and supporting evidence.</li><li>BIMED prepares the employer-side permit/sponsorship documentation and confirms the applicable permit type.</li><li>Where required, BIMED completes any Labour Market Needs Test and related recruitment evidence before submission.</li><li>After a permit decision, the visa stage is handled through the appropriate Irish immigration process where applicable.</li><li>Shift access stays blocked until the required permission to work is confirmed.</li></ol></section>
    </div>
  </main>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const button: React.CSSProperties = { marginTop: 14, padding: '11px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 };
const secondary: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800 };
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7' }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700 }}>{String(value || '—')}</div></div>; }
