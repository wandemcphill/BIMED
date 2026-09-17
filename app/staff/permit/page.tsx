'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPermitChecklist } from '@/lib/permit-checklist';

type Permit = Record<string, any>;
type AccommodationOption = {
  accommodation_plan: 'three_months_4000' | 'one_month_1250';
  accommodation_amount_eur: number;
  accommodation_period_months: number;
  accommodation_refund_installments: number;
  accommodation_refund_trigger: 'successful_three_month_probation' | 'one_month_accommodation_expiry';
  accommodation_plan_label: string;
  accommodation_summary: string;
  subsequent_accommodation: string;
  training_summary: string;
  permit_submission_route: 'candidate_or_agency' | 'bimed_legal_team';
  permit_submission_label: string;
  permit_fee_eur: number;
  permit_fee_payer: 'candidate_or_agency' | 'bimed';
  permit_type: 'general_employment_permit' | 'critical_skills_employment_permit';
  permit_type_label: string;
  permit_duration_months: number;
  role: string | null;
  immigration_registration_fee_guidance_eur: number;
  immigration_registration_fee_note: string;
};

const audienceLabel = {
  candidate: 'YOU / AGENCY',
  BIMED: 'BIMED',
  shared: 'SHARED',
} as const;

export default function StaffPermitPage() {
  const router = useRouter();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [packet, setPacket] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [accommodationReady, setAccommodationReady] = useState(false);
  const [options, setOptions] = useState<AccommodationOption[]>([]);
  const [role, setRole] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<AccommodationOption['accommodation_plan'] | ''>('');
  const [selectedRoute, setSelectedRoute] = useState<AccommodationOption['permit_submission_route'] | ''>('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [legacyRouteNeeded, setLegacyRouteNeeded] = useState(false);

  async function load() {
    const response = await fetch('/api/staff/permit', { cache: 'no-store' });
    const data = await response.json();
    if (response.status === 401) { router.replace('/staff/login'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load the permit workspace.'); return; }
    setPermit(data.permit);
    setPacket(data.packet);
    setInvoice(data.invoice);
    setInvoiceUrl(data.invoiceUrl);
    setAccommodationReady(Boolean(data.accommodationReady));
    setOptions(data.accommodationOptions || []);
    setRole(data.role || '');
    setLegacyRouteNeeded(Boolean(data.needsLegacyPermitRouteSelection));
    const existing = data.accommodationSelection;
    if (existing?.accommodation_plan) setSelectedPlan(existing.accommodation_plan);
    if (existing?.permit_submission_route) setSelectedRoute(existing.permit_submission_route);
  }
  useEffect(() => { void load(); }, []);

  const availablePlans = useMemo(() => ['three_months_4000', 'one_month_1250'] as const, []);
  const selectedOption = useMemo(() => options.find((option) => option.accommodation_plan === selectedPlan && option.permit_submission_route === selectedRoute) || null, [options, selectedPlan, selectedRoute]);
  const termsAcknowledged = Boolean(permit?.accommodation_terms_acknowledged_at);
  const selectionLocked = Boolean(permit?.permit_submission_route && termsAcknowledged);
  const planLocked = Boolean(termsAcknowledged && permit?.accommodation_plan);

  async function acknowledgeAccommodation() {
    if (!selectedPlan || !selectedRoute) { setError('Choose an accommodation plan and a permit submission route first.'); return; }
    if (!acknowledged) { setError('Please confirm that you understand the selected accommodation, payment, refund and permit-route terms.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'acknowledge_accommodation', acknowledged: true, accommodation_plan: selectedPlan, permit_submission_route: selectedRoute }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to record your acknowledgement.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record your acknowledgement.'); }
    finally { setBusy(false); }
  }

  async function selectLegacyRoute() {
    if (!selectedRoute) { setError('Choose who will submit and pay the employment permit application.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'select_permit_route', permit_submission_route: selectedRoute }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save the permit route.');
      setLegacyRouteNeeded(false);
      setPermit(data.permit);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the permit route.'); }
    finally { setBusy(false); }
  }

  async function requestJourney() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_sponsorship' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit the request.');
      setPermit(data.permit);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit the request.'); }
    finally { setBusy(false); }
  }

  if (error && !permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}><h1>Employment permit & sponsorship</h1><p style={{ color: '#9b2c2c' }}>{error}</p><button onClick={() => router.push('/staff')} style={button}>Back to Staff Portal</button></main>;
  if (!permit) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Loading employment permit workspace…</main>;

  const currentPlan = selectedPlan || permit.accommodation_plan || 'three_months_4000';
  const routeReady = Boolean(permit.permit_submission_route || selectedRoute);
  const currentRoute = (permit.permit_submission_route || selectedRoute || null) as AccommodationOption['permit_submission_route'] | null;
  const displayOption = selectedOption || options.find((option) => option.accommodation_plan === currentPlan && option.permit_submission_route === currentRoute) || null;
  const permitTypeLabel = displayOption?.permit_type_label || (permit.permit_type === 'critical_skills_employment_permit' ? 'Critical Skills Employment Permit (CSEP)' : permit.permit_type === 'general_employment_permit' ? 'General Employment Permit (GEP)' : 'BIMED to derive from your role');
  const checklist = getPermitChecklist(role || permit.role || null, currentRoute);

  return <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 'clamp(16px,4vw,28px)' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={secondary}>← Staff Portal</button>
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>OVERSEAS EMPLOYMENT</div><h1 style={{ margin: '4px 0', fontSize: 'clamp(30px,6vw,44px)', lineHeight: 1.08 }}>Employment permit & sponsorship</h1><p style={{ color: '#627d98', fontSize: 'clamp(16px,2.5vw,20px)', lineHeight: 1.6 }}>Choose the accommodation plan that applies to you and choose who will submit and pay the employment permit application. BIMED derives the permit type from your recruitment role. Final permit eligibility and decisions remain with the relevant Irish authorities.</p></div>
      <div style={{ ...card, marginTop: 18, borderColor: permit.work_authorised ? '#a7f3d0' : '#fde68a', background: permit.work_authorised ? '#ecfdf5' : '#fffbeb' }}><strong>{permit.work_authorised ? 'Work authorisation confirmed' : 'Work is not yet authorised'}</strong><p style={{ margin: '6px 0 0', color: '#627d98', lineHeight: 1.65 }}>{permit.work_authorised ? 'Your shift eligibility can be enabled by BIMED subject to normal rota requirements.' : 'You may use the Staff Portal for onboarding and immigration preparation, but you must not take shifts until BIMED confirms that you have the required permission to work in Ireland.'}</p></div>
      {error && <div style={{ ...card, marginTop: 14, color: '#9b2c2c' }}>{error}</div>}

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Your permit journey</h2><Info label='Current status' value={permit.status.replaceAll('_', ' ')} /><Info label='Recruitment role' value={role || permit.role} /><Info label='Permit type' value={permitTypeLabel} /><Info label='Submission route' value={displayOption?.permit_submission_label || permit.permit_submission_route || 'Choose below'} /><Info label='Permit fee' value={`€${Number(displayOption?.permit_fee_eur || permit.permit_fee_eur || 1000).toFixed(2)}`} /><Info label='Planned initial permit duration' value={`${Number(displayOption?.permit_duration_months || permit.permit_duration_months || 24)} months`} />
        {permit.status === 'requested' ? <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#ecfdf5', color: '#166534', lineHeight: 1.6 }}><strong>Permit assistance requested</strong><div>BIMED has received the request and will review the employer-side permit process for your role.</div></div> : accommodationReady && routeReady ? <div style={{ marginTop: 14 }}><p style={{ color: '#627d98', lineHeight: 1.6 }}>Your accommodation invoice has been issued and the permit route is recorded. You can now ask BIMED to begin the permit journey.</p><button disabled={busy} onClick={() => void requestJourney()} style={{ ...button, width: '100%', maxWidth: 620 }}>{busy ? 'Submitting…' : 'Request employment-permit assistance'}</button></div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#fffbeb', color: '#854d0e', lineHeight: 1.6 }}><strong>Permit assistance is locked</strong><div>{!routeReady ? 'Choose the permit submission route below.' : 'BIMED must issue the accommodation invoice before the permit-assistance request can be submitted.'}</div></div>}
      </section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>1. Choose your accommodation plan</h2><p style={muted}>Both plans include BIMED relocation flights and Dublin Airport pickup. The €1,250 plan covers only the first month, after which you arrange your own accommodation in Ireland.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14, marginTop: 14 }}>
        {availablePlans.map((plan) => {
          const option = options.find((item) => item.accommodation_plan === plan && item.permit_submission_route === (selectedRoute || 'bimed_legal_team')) || options.find((item) => item.accommodation_plan === plan);
          if (!option) return null;
          const selected = currentPlan === plan;
          return <button key={plan} type='button' disabled={planLocked || busy} onClick={() => setSelectedPlan(plan)} style={{ textAlign: 'left', border: selected ? '2px solid #0f766e' : '1px solid #d9e2ec', borderRadius: 14, padding: 16, background: selected ? '#f0fdfa' : '#fff', cursor: planLocked ? 'default' : 'pointer', color: '#102a43' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', letterSpacing: .6 }}>{plan === 'three_months_4000' ? '3-MONTH PLAN' : '1-MONTH PLAN'}</div><h3 style={{ margin: '4px 0 4px', fontSize: 22 }}>{option.accommodation_plan_label}</h3></div>{selected && <span style={{ fontSize: 11, fontWeight: 900, background: '#ccfbf1', padding: '5px 8px', borderRadius: 999 }}>SELECTED</span>}</div><p style={{ lineHeight: 1.6, margin: '8px 0', color: '#334e68' }}>{option.accommodation_summary}</p><p style={{ lineHeight: 1.6, margin: 0, color: '#627d98' }}>{option.subsequent_accommodation}</p><div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#f8fafc', color: '#334e68', fontSize: 13 }}><strong>{plan === 'one_month_1250' ? 'Training month:' : 'Probationary period:'}</strong> {option.training_summary}</div></button>;
        })}
      </div></section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>2. Choose who submits and pays the employment permit</h2><p style={muted}>The permit type is not a user choice. BIMED derives it from your recruitment role and applies the relevant route. The current application fee guidance is €1,000 for a permit covering more than 6 months up to 24 months.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14, marginTop: 14 }}>
        {(['candidate_or_agency','bimed_legal_team'] as const).map((route) => {
          const option = options.find((item) => item.accommodation_plan === (selectedPlan || currentPlan) && item.permit_submission_route === route);
          if (!option) return null;
          const selected = (selectedRoute || permit.permit_submission_route) === route;
          return <button key={route} type='button' disabled={selectionLocked || busy || (legacyRouteNeeded === false && termsAcknowledged && Boolean(permit.permit_submission_route))} onClick={() => setSelectedRoute(route)} style={{ textAlign: 'left', border: selected ? '2px solid #0f766e' : '1px solid #d9e2ec', borderRadius: 14, padding: 16, background: selected ? '#f0fdfa' : '#fff', cursor: selectionLocked ? 'default' : 'pointer', color: '#102a43' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3 style={{ margin: 0 }}>{route === 'bimed_legal_team' ? 'BIMED legal team' : 'Candidate / recruitment agency'}</h3>{selected && <span style={{ fontSize: 11, fontWeight: 900, background: '#ccfbf1', padding: '5px 8px', borderRadius: 999 }}>SELECTED</span>}</div><p style={{ lineHeight: 1.6, margin: '8px 0', color: '#334e68' }}>{route === 'bimed_legal_team' ? 'BIMED submits the application on your behalf and BIMED pays the permit fee. BIMED does not recover that fee through salary deduction or repayment.' : 'You or your recruitment agency submit and pay the employment permit fee directly.'}</p><Info label='Derived permit type for this role' value={option.permit_type_label} /><Info label='Permit fee' value={`€${option.permit_fee_eur.toFixed(2)}`} /></button>;
        })}
      </div><div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f8fafc', color: '#334e68', lineHeight: 1.6 }}><strong>After arrival:</strong> Irish immigration registration is normally €300 when a fee applies, with exemptions and current ISD requirements possible. Registration happens after arrival and is separate from the employment permit.</div></section>

      {displayOption && <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Selected arrangement</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}><Info label='Accommodation' value={displayOption.accommodation_plan_label} /><Info label='Permit route' value={displayOption.permit_submission_label} /><Info label='Permit type' value={displayOption.permit_type_label} /><Info label='Refund trigger' value={displayOption.accommodation_refund_trigger === 'one_month_accommodation_expiry' ? 'One-month accommodation expiry' : 'Successful three-month probation'} /><Info label='Permit fee payer' value={displayOption.permit_fee_payer === 'bimed' ? 'BIMED' : 'Candidate / agency'} /><Info label='Flights + airport pickup' value='Available under both plans' /></div>{displayOption.accommodation_plan === 'one_month_1250' && <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#ecfdf5', color: '#166534', lineHeight: 1.65 }}>For the €1,250 plan, the refund trigger depends on the permit route. BIMED-paid/employer-executed permit route: refund after successful three-month probation, in four weekly instalments. Candidate/agency-paid permit route: refund when the one-month accommodation arrangement expires, with processing governed by the applicable accommodation terms.</div>}</section>}

      <section style={{ ...card, marginTop: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><div><div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 900, fontSize: 12 }}>{termsAcknowledged ? 'SELECTION RECORDED' : 'ACKNOWLEDGEMENT REQUIRED'}</div><h2 style={{ margin: '10px 0 8px' }}>Accommodation acknowledgement</h2></div><div style={{ fontSize: 22, fontWeight: 900, color: '#0f766e', whiteSpace: 'nowrap' }}>€{Number(permit.accommodation_amount_eur || displayOption?.accommodation_amount_eur || 0).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</div></div>{!termsAcknowledged ? <><p style={{ lineHeight: 1.7 }}>You must select both the accommodation plan and the permit submission route before BIMED can create the invoice.</p><label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#334e68', lineHeight: 1.6 }}><input type='checkbox' checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} /><span>I understand the selected accommodation arrangement, the applicable refund trigger, who will submit and pay the employment permit, the permit fee, and that immigration/permit approvals remain subject to the relevant authorities.</span></label><button disabled={busy || !selectedOption || !acknowledged} onClick={() => void acknowledgeAccommodation()} style={{ ...button, width: '100%', maxWidth: 720, opacity: busy || !selectedOption || !acknowledged ? 0.55 : 1 }}>{busy ? 'Recording…' : 'Confirm selections and request accommodation invoice'}</button></> : legacyRouteNeeded ? <><p style={{ lineHeight: 1.7 }}>This is a legacy €4,000 / 3-month acknowledgement created before the permit-route choice was added. Your accommodation plan remains unchanged. Select who will submit and pay the employment permit so BIMED can continue the permit workflow.</p><button disabled={busy || !selectedRoute} onClick={() => void selectLegacyRoute()} style={{ ...button, width: '100%', maxWidth: 620, opacity: busy || !selectedRoute ? 0.55 : 1 }}>{busy ? 'Saving…' : 'Save permit submission route'}</button></> : <div style={{ marginTop: 14, padding: 16, borderRadius: 12, background: '#ecfdf5', color: '#166534' }}><strong>Accommodation terms and selections recorded</strong><div style={{ marginTop: 5, lineHeight: 1.6 }}>Your plan and permit route are snapshotted. They cannot be changed from the Staff Portal after invoice issuance. {accommodationReady ? 'The invoice has been issued and your next workflows are unlocked.' : 'The invoice is in the billing workflow and your permit/travel workflows remain locked until BIMED issues it.'}</div>{invoice && invoiceUrl && ['issued','paid'].includes(invoice.status) ? <a href={invoiceUrl} target='_blank' rel='noreferrer' style={{ ...secondary, display: 'inline-block', marginTop: 12 }}>Open accommodation invoice</a> : <div style={{ marginTop: 10, color: '#627d98' }}>The invoice is being prepared by BIMED billing.</div>}</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Travel to Ireland</h2><p style={{ color: '#627d98', lineHeight: 1.65 }}>BIMED provides relocation flights and Dublin Airport pickup under both accommodation plans. Once the accommodation invoice has been issued, your virtual flight-planning workspace can unlock. BIMED pays for the actual economy flight and arranges the airport pickup after immigration clearance. You do not buy the flight yourself.</p><button type='button' disabled={!accommodationReady} onClick={() => router.push('/staff/travel')} style={{ ...button, width: '100%', maxWidth: 520, opacity: accommodationReady ? 1 : .55, cursor: accommodationReady ? 'pointer' : 'not-allowed' }}>Open Dublin flight planning</button>{!accommodationReady && <div style={{ marginTop: 8, color: '#854d0e', fontSize: 13 }}>Flight planning unlocks after BIMED issues the accommodation invoice.</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Information BIMED will use</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}><div><h3>Employee</h3><Info label='Full name' value={packet?.employee?.full_name} /><Info label='Nationality' value={packet?.employee?.nationality} /><Info label='Date of birth' value={packet?.employee?.date_of_birth} /><Info label='Phone' value={packet?.employee?.phone} /><Info label='Address' value={packet?.employee?.residential_address} /></div><div><h3>Employment</h3><Info label='Employer' value={packet?.employment?.employer} /><Info label='Position' value={packet?.employment?.position} /><Info label='Role applied' value={packet?.employment?.role_applied || role} /><Info label='Start date' value={packet?.employment?.start_date} /><Info label='Salary' value={packet?.employment?.annual_salary_eur ? `€${packet.employment.annual_salary_eur.toLocaleString()}` : 'To be confirmed'} /></div></div></section>

      {checklist ? <section style={{ ...card, marginTop: 18, marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: '#0f766e' }}>ROLE-SPECIFIC PREPARATION</div><h2 style={{ margin: '4px 0 6px' }}>{checklist.checklist_title}</h2><p style={{ ...muted, margin: 0 }}>Built from the current DETE permit checklist for this pathway, with the BIMED submission route layered on top.</p></div>
          <a href={checklist.source_url} target='_blank' rel='noreferrer' style={secondary}>Open official DETE checklist ↗</a>
        </div>
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f8fafc', color: '#334e68', lineHeight: 1.6 }}><strong>Official source:</strong> {checklist.source_label}<br /><strong>Submission route:</strong> {checklist.submission_route_label}</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {checklist.items.map((item) => <div key={item.id} style={{ border: '1px solid #e5eaf0', borderRadius: 12, padding: 14, background: '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><strong>{item.title}</strong><span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: .5, padding: '4px 7px', borderRadius: 999, background: item.audience === 'BIMED' ? '#e0f2fe' : item.audience === 'candidate' ? '#fef3c7' : '#ecfdf5', color: '#334e68' }}>{audienceLabel[item.audience]}</span></div><p style={{ margin: '6px 0 0', color: '#627d98', lineHeight: 1.6 }}>{item.detail}{item.conditional ? ' Conditional: verify whether this applies to this candidate and application.' : ''}</p></div>)}
        </div>
        <div style={{ marginTop: 14, padding: 14, border: '1px solid #d9e2ec', borderRadius: 12, background: '#fbfdff' }}><strong>Case-specific notes</strong><ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#627d98', lineHeight: 1.65 }}>{checklist.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
      </section> : <section style={{ ...card, marginTop: 18, marginBottom: 30 }}><h2 style={{ marginTop: 0 }}>Permit checklist</h2><p style={muted}>BIMED needs to review the recruitment role before a role-specific employment-permit checklist can be shown.</p></section>}
    </div>
  </main>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(16px,3vw,20px)', boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const button: React.CSSProperties = { marginTop: 14, padding: '12px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 };
const secondary: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
const muted: React.CSSProperties = { color: '#627d98', lineHeight: 1.55 };
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7', minWidth: 0 }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{String(value ?? '—')}</div></div>; }
