'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPermitChecklist } from '@/lib/permit-checklist';
import { ACCOMMODATION_GBP_RATE_SOURCE, accommodationGbpEquivalent, isSharedAccommodationPlan, sharedAccommodationTotalEur } from '@/lib/employment-permit-options';

type Permit = Record<string, any>;
type AccommodationOption = {
  accommodation_plan: 'three_months_4000' | 'three_months_shared_2000' | 'one_month_1250' | 'one_month_shared_625';
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
  const [changePlanMode, setChangePlanMode] = useState(false);
  const [partnerIdentifier, setPartnerIdentifier] = useState('');
  const [sharedBillingRecovery, setSharedBillingRecovery] = useState<any>(null);

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
    setSharedBillingRecovery(data.sharedBillingRecovery || null);
    const existing = data.accommodationSelection;
    if (existing?.accommodation_plan) setSelectedPlan(existing.accommodation_plan);
    if (existing?.permit_submission_route) setSelectedRoute(existing.permit_submission_route);
  }
  useEffect(() => { void load(); }, []);

  const persistedPlan = (permit?.accommodation_plan || '') as AccommodationOption['accommodation_plan'] | '';
  const currentPlan = selectedPlan || persistedPlan;
  const availablePlans = useMemo(() => ['three_months_4000', 'three_months_shared_2000', 'one_month_1250', 'one_month_shared_625'] as const, []);
  const selectedOption = useMemo(() => options.find((option) => option.accommodation_plan === selectedPlan && option.permit_submission_route === selectedRoute) || null, [options, selectedPlan, selectedRoute]);
  const termsAcknowledged = Boolean(permit?.accommodation_terms_acknowledged_at);
  const selectionLocked = Boolean(permit?.permit_submission_route && termsAcknowledged);
  const planLocked = Boolean(termsAcknowledged && permit?.accommodation_plan) && !changePlanMode;
  const sharedPartner = permit?.accommodation_share_role === 'partner' && Boolean(permit?.accommodation_share_id);
  const sharedPrimaryUnlinked = !sharedPartner && Boolean(permit?.accommodation_terms_acknowledged_at && isSharedAccommodationPlan(permit?.accommodation_plan as any) && !permit?.accommodation_share_id);
  const currentSharedTotal = isSharedAccommodationPlan(currentPlan as any) ? sharedAccommodationTotalEur(currentPlan as any) : null;
  const displayedPlans = useMemo(() => sharedPartner ? [currentPlan] as const : availablePlans, [availablePlans, sharedPartner, currentPlan]);
  const canChangeAccommodation = Boolean(termsAcknowledged && permit?.permit_submission_route && invoice && ['draft', 'issued'].includes(invoice.status) && !permit?.requested_at && permit?.status === 'not_started' && !permit?.cancellation_requested_at && !permit?.cancellation_finalized_at);

  async function acknowledgeAccommodation() {
    if (!selectedPlan || !selectedRoute) { setError('Choose an accommodation plan and a permit submission route first.'); return; }
    if (!acknowledged) { setError('Please confirm that you understand the selected accommodation, payment, refund and permit-route terms.'); return; }
    setBusy(true); setError('');
    try {
      const isShared = isSharedAccommodationPlan(selectedPlan);
      const action = isShared
        ? (partnerIdentifier.trim() ? 'acknowledge_shared_accommodation' : 'request_shared_accommodation_match')
        : 'acknowledge_accommodation';
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          acknowledged: true,
          accommodation_plan: selectedPlan,
          permit_submission_route: selectedRoute,
          ...(isShared ? { partner_identifier: partnerIdentifier.trim() || null } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to record your acknowledgement.');
      setPartnerIdentifier('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record your acknowledgement.');
      await load();
    }
    finally { setBusy(false); }
  }

  async function changeAccommodationPlan() {
    if (!selectedPlan) { setError('Choose the new accommodation plan first.'); return; }
    if (!acknowledged) { setError('Please confirm that you understand the new accommodation plan and its terms.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'change_accommodation_selection',
          acknowledged: true,
          accommodation_plan: selectedPlan,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to change your accommodation plan.');
      setChangePlanMode(false);
      setAcknowledged(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change your accommodation plan.');
    } finally {
      setBusy(false);
    }
  }

  async function linkExistingSharedPartner() {
    if (!partnerIdentifier.trim()) {
      setError('Enter the BIMED ID or BIMED email of the candidate you will share accommodation with.');
      return;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'link_existing_shared_accommodation_partner', partner_identifier: partnerIdentifier.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to link the accommodation-sharing candidate.');
      setPartnerIdentifier('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to link the accommodation-sharing candidate.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function retrySharedInvoiceIssuance() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retry_shared_accommodation_invoice_issuance' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to recover shared accommodation invoices.');
      setSharedBillingRecovery(data.sharedBillingRecovery || null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to recover shared accommodation invoices.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeSharedPartner() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge_shared_accommodation_partner' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to acknowledge the shared accommodation arrangement.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to acknowledge the shared accommodation arrangement.');
    } finally {
      setBusy(false);
    }
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

  async function requestSponsorshipCancellation() {
    const confirmed = window.confirm(
      'Reject the accommodation fee and cancel sponsorship?\\n\\nThis starts a 24-hour reversal window. Before the deadline, use Employment permit → Revoke cancellation to continue your application. If you do not revoke the cancellation within 24 hours, BIMED will automatically restrict your portal access, withdraw your recruitment application, void the employment contract and end the employment-permit / sponsorship journey.'
    );
    if (!confirmed) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'request_sponsorship_cancellation', reason: 'Candidate rejected the accommodation fee and requested cancellation of the sponsorship journey.' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to record the cancellation.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record the cancellation.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeSponsorshipCancellation() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_sponsorship_cancellation' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to revoke the cancellation.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to revoke the cancellation.');
    } finally {
      setBusy(false);
    }
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

  const changePlanDisabled = !selectedPlan || !acknowledged || selectedPlan === permit.accommodation_plan;


  const routeReady = Boolean(permit.permit_submission_route || selectedRoute);
  const currentRoute = (permit.permit_submission_route || selectedRoute || null) as AccommodationOption['permit_submission_route'] | null;
  const displayOption = selectedOption || options.find((option) => option.accommodation_plan === currentPlan && option.permit_submission_route === currentRoute) || null;
  const selectedPlanOption = selectedPlan ? options.find((option) => option.accommodation_plan === selectedPlan && option.permit_submission_route === currentRoute) || options.find((option) => option.accommodation_plan === selectedPlan) || null : null;
  const acknowledgementAmount = selectedPlanOption && !termsAcknowledged
    ? Number(selectedPlanOption.accommodation_amount_eur)
    : changePlanMode && selectedPlanOption
      ? Number(selectedPlanOption.accommodation_amount_eur)
      : Number(permit.accommodation_amount_eur || displayOption?.accommodation_amount_eur || 0);
  const currentShareSnapshot = permit?.accommodation_selection_snapshot || {};
  const permitTypeLabel = displayOption?.permit_type_label || (permit.permit_type === 'critical_skills_employment_permit' ? 'Critical Skills Employment Permit (CSEP)' : permit.permit_type === 'general_employment_permit' ? 'General Employment Permit (GEP)' : 'BIMED to derive from your role');
  const checklist = getPermitChecklist(role || permit.role || null, currentRoute);
  const cancellationPending = Boolean(permit.cancellation_requested_at && !permit.cancellation_revoked_at && !permit.cancellation_finalized_at);
  const cancellationFinalized = Boolean(permit.cancellation_finalized_at);
  const cancellationDeadline = permit.cancellation_deadline_at ? new Date(permit.cancellation_deadline_at) : null;

  return <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 'clamp(16px,4vw,28px)' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={secondary}>← Staff Portal</button>
      <div style={{ marginTop: 16 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>OVERSEAS EMPLOYMENT</div><h1 style={{ margin: '4px 0', fontSize: 'clamp(30px,6vw,44px)', lineHeight: 1.08 }}>Employment permit & sponsorship</h1><p style={{ color: '#627d98', fontSize: 'clamp(16px,2.5vw,20px)', lineHeight: 1.6 }}>Choose the accommodation plan that applies to you and choose who will submit and pay the employment permit application. Once you confirm the package, BIMED issues the accommodation invoice immediately so you can review the selected arrangement and amount. Payment account details are requested separately from the BIMED manager when you are ready to pay. BIMED derives the permit type from your recruitment role. Final permit eligibility and decisions remain with the relevant Irish authorities.</p></div>
      <div style={{ ...card, marginTop: 18, borderColor: permit.work_authorised ? '#a7f3d0' : '#fde68a', background: permit.work_authorised ? '#ecfdf5' : '#fffbeb' }}><strong>{permit.work_authorised ? 'Work authorisation confirmed' : 'Work is not yet authorised'}</strong><p style={{ margin: '6px 0 0', color: '#627d98', lineHeight: 1.65 }}>{permit.work_authorised ? 'Your shift eligibility can be enabled by BIMED subject to normal rota requirements.' : 'You may use the Staff Portal for onboarding and immigration preparation, but you must not take shifts until BIMED confirms that you have the required permission to work in Ireland.'}</p></div>
      {error && <div style={{ ...card, marginTop: 14, color: '#9b2c2c' }}>{error}</div>}

      {sharedBillingRecovery?.needsRecovery && !cancellationFinalized && (
        <section style={{ ...card, marginTop: 14, borderColor: '#f59e0b', background: '#fffbeb' }}>
          <div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontWeight: 900, fontSize: 12 }}>BILLING RECOVERY</div>
          <h2 style={{ margin: '10px 0 8px', color: '#92400e' }}>Shared accommodation invoice recovery</h2>
          <p style={{ margin: 0, color: '#7c2d12', lineHeight: 1.65 }}>
            The shared accommodation arrangement is already saved. One or more of the two linked invoices still needs to be issued. The existing invoice record will be reused, so retrying will not create a duplicate invoice.
          </p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <Info label='Primary invoice' value={sharedBillingRecovery.primaryInvoice ? `${sharedBillingRecovery.primaryInvoice.invoiceNumber} · ${sharedBillingRecovery.primaryInvoice.status}` : 'Missing'} />
            <Info label='Partner invoice' value={sharedBillingRecovery.partnerInvoice ? `${sharedBillingRecovery.partnerInvoice.invoiceNumber} · ${sharedBillingRecovery.partnerInvoice.status}` : 'Missing'} />
          </div>
          <button type='button' disabled={busy} onClick={() => void retrySharedInvoiceIssuance()} style={{ ...button, width: '100%', maxWidth: 720 }}>
            {busy ? 'Recovering invoices…' : 'Retry shared invoice issuance'}
          </button>
        </section>
      )}

      {cancellationPending && cancellationDeadline && (
        <section style={{ ...card, marginTop: 18, borderColor: '#fb923c', background: '#fff7ed' }}>
          <div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: '#fed7aa', color: '#9a3412', fontWeight: 900, fontSize: 12 }}>CANCELLATION PENDING</div>
          <h2 style={{ margin: '10px 0 8px', color: '#9a3412' }}>24-hour reversal window</h2>
          <p style={{ margin: 0, color: '#7c2d12', lineHeight: 1.7 }}>
            You rejected the accommodation fee and requested cancellation of the sponsorship journey. Your cancellation is <strong>not yet final</strong>.
            You may revoke it before <strong>{cancellationDeadline.toLocaleString()}</strong> and continue your application.
          </p>
          <p style={{ margin: '10px 0 0', color: '#7c2d12', lineHeight: 1.7 }}>
            If you do not revoke it before the deadline, BIMED will automatically <strong>restrict your Staff Portal access, withdraw your recruitment application, void your employment contract, and end your employment-permit / sponsorship journey</strong>.
          </p>
          <button
            type='button'
            disabled={busy}
            onClick={() => void revokeSponsorshipCancellation()}
            style={{ ...button, background: '#0f766e', width: '100%', maxWidth: 620 }}
          >
            {busy ? 'Restoring…' : 'Revoke cancellation and continue my application'}
          </button>
          <div style={{ marginTop: 10, color: '#7c2d12', fontSize: 13 }}>
            Need clarification? Contact <strong>info@bimedhealthcare.com</strong> before the deadline.
          </div>
        </section>
      )}

      {cancellationFinalized && (
        <section style={{ ...card, marginTop: 18, borderColor: '#fecaca', background: '#fef2f2' }}>
          <div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: '#fecaca', color: '#991b1b', fontWeight: 900, fontSize: 12 }}>SPONSORSHIP CLOSED</div>
          <h2 style={{ margin: '10px 0 8px', color: '#991b1b' }}>Application withdrawn</h2>
          <p style={{ margin: 0, color: '#7f1d1d', lineHeight: 1.7 }}>
            The 24-hour cancellation window expired. Your recruitment application has been withdrawn, your employment contract has been voided, and the employment-permit / sponsorship journey has ended. Staff Portal access is restricted.
          </p>
          <p style={{ margin: '10px 0 0', color: '#7f1d1d', lineHeight: 1.7 }}>
            Contact <strong>info@bimedhealthcare.com</strong> if you believe this action was applied in error.
          </p>
        </section>
      )}

      {invoice && !cancellationPending && !cancellationFinalized && ['issued', 'payment_reported'].includes(invoice.status) && (
        <section style={{ ...card, marginTop: 18, borderColor: '#fca5a5', background: '#fffafa' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.1, color: '#b42318' }}>IMPORTANT DECISION</div>
          <h2 style={{ margin: '5px 0 8px', color: '#7f1d1d' }}>Do not proceed unless you accept the required fees</h2>
          <p style={{ margin: 0, color: '#7f1d1d', lineHeight: 1.7 }}>
            You may reject the accommodation fee. The button below is a formal cancellation of this accommodation arrangement and your BIMED sponsorship journey. It is <strong>not</strong> a routine invoice cancellation.
          </p>
          <p style={{ margin: '10px 0 0', color: '#7f1d1d', lineHeight: 1.7 }}>
            Clicking it starts a <strong>24-hour reversal window</strong>. During that window you can revoke the cancellation and continue. After 24 hours, BIMED will automatically restrict portal access, withdraw the application, void the employment contract and end sponsorship.
          </p>
          <button
            type='button'
            disabled={busy}
            onClick={() => void requestSponsorshipCancellation()}
            style={{ marginTop: 14, padding: '12px 15px', border: '1px solid #b42318', borderRadius: 9, background: '#fff7f5', color: '#9b2c2c', fontWeight: 900, width: '100%', maxWidth: 720 }}
          >
            {busy ? 'Recording…' : 'Reject accommodation fee & cancel sponsorship'}
          </button>
          <div style={{ marginTop: 9, color: '#7f1d1d', fontSize: 13 }}>
            A notification is sent to <strong>info@bimedhealthcare.com</strong>. You can revoke before the deadline from this page.
          </div>
        </section>
      )}

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Your permit journey</h2><Info label='Current status' value={permit.status.replaceAll('_', ' ')} /><Info label='Recruitment role' value={role || permit.role} /><Info label='Permit type' value={permitTypeLabel} /><Info label='Submission route' value={displayOption?.permit_submission_label || permit.permit_submission_route || 'Choose below'} /><Info label='Permit fee' value={`€${Number(displayOption?.permit_fee_eur || permit.permit_fee_eur || 1000).toFixed(2)}`} /><Info label='Planned initial permit duration' value={`${Number(displayOption?.permit_duration_months || permit.permit_duration_months || 24)} months`} />
        {permit.status === 'requested' ? <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#ecfdf5', color: '#166534', lineHeight: 1.6 }}><strong>Permit assistance requested</strong><div>BIMED has received the request and will review the employer-side permit process for your role.</div></div> : accommodationReady && routeReady ? <div style={{ marginTop: 14 }}><p style={{ color: '#627d98', lineHeight: 1.6 }}>Your accommodation invoice has been issued and the permit route is recorded. Open the invoice to review your selected arrangement and amount. When you are ready to pay, email {'manager@bimedhealthcare.com'} for the current payment details, then ask BIMED to begin the permit journey.</p><button disabled={busy} onClick={() => void requestJourney()} style={{ ...button, width: '100%', maxWidth: 620 }}>{busy ? 'Submitting…' : 'Request employment-permit assistance'}</button></div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#fffbeb', color: '#854d0e', lineHeight: 1.6 }}><strong>Permit assistance is locked</strong><div>{!routeReady ? 'Choose the permit submission route below.' : 'BIMED must issue the accommodation invoice before the permit-assistance request can be submitted.'}</div></div>}
      </section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>1. Choose your accommodation plan</h2><p style={muted}>All accommodation plans include BIMED relocation flights and Dublin Airport pickup. For shared accommodation, the displayed amount is <strong>your half</strong> of the underlying €4,000 or €1,250 arrangement. You must provide the BIMED ID or BIMED email of the candidate sharing with you.</p><p style={{ ...muted, marginTop: 8 }}>GBP figures are indicative equivalents for candidates who prefer to pay in pounds, using today's reference rate. The invoice remains denominated in EUR. Rate source: {ACCOMMODATION_GBP_RATE_SOURCE}.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 14, marginTop: 14 }}>
        {displayedPlans.map((plan) => {
          const option = options.find((item) => item.accommodation_plan === plan && item.permit_submission_route === (selectedRoute || 'bimed_legal_team')) || options.find((item) => item.accommodation_plan === plan);
          if (!option) return null;
          const selected = currentPlan === plan;
          const selectable = !planLocked && !busy && !sharedPartner;
          return <button key={plan} type='button' disabled={planLocked || busy || sharedPartner} aria-pressed={selected} onClick={() => { setSelectedPlan(plan); setError(''); if (changePlanMode) { setAcknowledged(false); setSelectedRoute(permit.permit_submission_route || ''); } }} style={{ display: 'block', width: '100%', textAlign: 'left', border: selected ? '2px solid #0f766e' : '1px solid #d9e2ec', borderRadius: 14, padding: 16, background: selected ? '#f0fdfa' : '#fff', cursor: selectable ? 'pointer' : 'default', color: '#102a43', opacity: selectable ? 1 : 0.72 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', letterSpacing: .6 }}>{plan === 'three_months_4000' ? '3-MONTH PLAN' : plan === 'three_months_shared_2000' ? '3-MONTH SHARED PLAN' : plan === 'one_month_shared_625' ? '1-MONTH SHARED PLAN' : '1-MONTH PLAN'}</div><h3 style={{ margin: '4px 0 4px', fontSize: 22 }}>{option.accommodation_plan_label}</h3></div>{selected && <span style={{ fontSize: 11, fontWeight: 900, background: '#ccfbf1', padding: '5px 8px', borderRadius: 999 }}>SELECTED</span>}</div><p style={{ lineHeight: 1.6, margin: '8px 0', color: '#334e68' }}>{option.accommodation_summary}</p><p style={{ lineHeight: 1.6, margin: 0, color: '#627d98' }}>{option.subsequent_accommodation}</p><div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: '#f8fafc', color: '#334e68', fontSize: 13 }}><strong>{plan === 'three_months_4000' || plan === 'three_months_shared_2000' ? 'Probationary period:' : plan === 'one_month_shared_625' ? 'Shared training month:' : 'Training month:'}</strong> {option.training_summary}</div></button>;
        })}
      </div></section>

      <section style={{ ...card, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>2. Choose who submits and pays the employment permit</h2>
        {!selectedPlan && !termsAcknowledged ? (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: '#fffbeb', color: '#854d0e', lineHeight: 1.6 }}>
            <strong>Select an accommodation plan first.</strong> Your permit submission options will appear here after you choose a plan.
          </div>
        ) : null}
        <p style={muted}>The permit type is not a user choice. BIMED derives it from your recruitment role and applies the relevant route. The current application fee guidance is €1,000 for a permit covering more than 6 months up to 24 months.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 14, marginTop: 14 }}>
        {selectedPlan && (['candidate_or_agency','bimed_legal_team'] as const).map((route) => {
          const option = options.find((item) => item.accommodation_plan === (selectedPlan || currentPlan) && item.permit_submission_route === route);
          if (!option) return null;
          const selected = (selectedRoute || permit.permit_submission_route) === route;
          return <button key={route} type='button' disabled={selectionLocked || busy || (legacyRouteNeeded === false && termsAcknowledged && Boolean(permit.permit_submission_route))} onClick={() => setSelectedRoute(route)} style={{ display: 'block', width: '100%', textAlign: 'left', border: selected ? '2px solid #0f766e' : '1px solid #d9e2ec', borderRadius: 14, padding: 16, background: selected ? '#f0fdfa' : '#fff', cursor: selectionLocked ? 'default' : 'pointer', color: '#102a43' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3 style={{ margin: 0 }}>{route === 'bimed_legal_team' ? 'BIMED legal team' : 'Candidate / recruitment agency'}</h3>{selected && <span style={{ fontSize: 11, fontWeight: 900, background: '#ccfbf1', padding: '5px 8px', borderRadius: 999 }}>SELECTED</span>}</div><p style={{ lineHeight: 1.6, margin: '8px 0', color: '#334e68' }}>{route === 'bimed_legal_team' ? 'BIMED submits the application on your behalf and BIMED pays the permit fee. BIMED does not recover that fee through salary deduction or repayment.' : 'You or your recruitment agency submit and pay the employment permit fee directly.'}</p><Info label='Derived permit type for this role' value={option.permit_type_label} /><Info label='Permit fee' value={`€${option.permit_fee_eur.toFixed(2)}`} /></button>;
        })}
      </div><div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f8fafc', color: '#334e68', lineHeight: 1.6 }}><strong>After arrival:</strong> Irish immigration registration is normally €300 when a fee applies, with exemptions and current ISD requirements possible. Registration happens after arrival and is separate from the employment permit.</div></section>

      {displayOption && <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Selected arrangement</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12 }}><Info label='Accommodation' value={displayOption.accommodation_plan_label} /><Info label='Permit route' value={displayOption.permit_submission_label} /><Info label='Permit type' value={displayOption.permit_type_label} /><Info label='Refund trigger' value={displayOption.accommodation_refund_trigger === 'one_month_accommodation_expiry' ? 'One-month accommodation expiry' : 'Successful three-month probation'} /><Info label='Permit fee payer' value={displayOption.permit_fee_payer === 'bimed' ? 'BIMED' : 'Candidate / agency'} /><Info label='Flights + airport pickup' value='Available under both plans' /></div>{displayOption.accommodation_plan === 'one_month_1250' && <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#ecfdf5', color: '#166534', lineHeight: 1.65 }}>For the €1,250 plan, the refund trigger depends on the permit route. BIMED-paid/employer-executed permit route: refund after successful three-month probation, in four weekly instalments. Candidate/agency-paid permit route: refund when the one-month accommodation arrangement expires, with processing governed by the applicable accommodation terms.</div>}</section>}

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: changePlanMode ? '#fef3c7' : '#fee2e2', color: changePlanMode ? '#92400e' : '#991b1b', fontWeight: 900, fontSize: 12 }}>
              {termsAcknowledged ? (changePlanMode ? 'CHANGING PLAN' : sharedPartner ? 'SHARED ARRANGEMENT' : 'SELECTION RECORDED') : 'ACKNOWLEDGEMENT REQUIRED'}
            </div>
            <h2 style={{ margin: '10px 0 8px' }}>{sharedPartner ? 'Shared accommodation assignment' : changePlanMode ? 'Change accommodation plan' : 'Accommodation acknowledgement'}</h2>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f766e' }}>€{acknowledgementAmount.toLocaleString('en-IE', { minimumFractionDigits: 2 })} EUR</div>
            <div style={{ marginTop: 3, fontSize: 13, fontWeight: 800, color: '#627d98' }}>≈ £{accommodationGbpEquivalent(acknowledgementAmount).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP</div>
          </div>
        </div>
        {sharedPartner ? <div style={{ marginTop: 14, padding: 16, borderRadius: 12, background: '#eef7f7', color: '#334e68', lineHeight: 1.7 }}>
          <strong>You have been assigned to a shared accommodation arrangement.</strong>
          <div style={{ marginTop: 6 }}>Arrangement reference: <strong>{currentShareSnapshot.share_reference || '—'}</strong>.</div>
          <div>Sharing with: <strong>{currentShareSnapshot.primary_name || currentShareSnapshot.partner_name || 'Your BIMED accommodation partner'}</strong> ({currentShareSnapshot.primary_bimed_id || currentShareSnapshot.partner_bimed_id || '—'}).</div>
          <div>Your accommodation share: <strong>€{Number(permit.accommodation_amount_eur || 0).toLocaleString('en-IE', { minimumFractionDigits: 2 })}</strong>.</div>
          {termsAcknowledged ? <div style={{ marginTop: 10, color: '#166534', fontWeight: 800 }}>Shared accommodation terms acknowledged.</div> : <><p style={{ margin: '10px 0' }}>Your invoice has already been issued for your share. Review the shared accommodation terms, then acknowledge them to continue your Staff Portal journey.</p><button disabled={busy} onClick={() => void acknowledgeSharedPartner()} style={{ ...button, width: '100%', maxWidth: 620 }}>{busy ? 'Acknowledging…' : 'Acknowledge shared accommodation'}</button></>}
          {invoice && invoiceUrl && ['issued','paid'].includes(invoice.status) && <a href={invoiceUrl} target='_blank' rel='noreferrer' style={{ ...secondary, display: 'inline-block', marginTop: 12 }}>Open your shared accommodation invoice</a>}
        </div> : !termsAcknowledged ? <>
          <p style={{ lineHeight: 1.7 }}>Choose the accommodation plan and permit submission route before BIMED issues your invoice. The amount shown here always matches the plan currently selected above.</p>
          {isSharedAccommodationPlan(selectedPlan as any) && <div style={{ margin: '12px 0', padding: 14, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#7c2d12', lineHeight: 1.65 }}>
            <strong>Shared accommodation</strong>
            <div style={{ marginTop: 5 }}>Your share is <strong>€{currentSharedTotal ? (currentSharedTotal / 2).toLocaleString('en-IE', { minimumFractionDigits: 2 }) : '—'} EUR</strong>. You do not need to know another BIMED candidate before selecting this plan. BIMED can arrange the sharing partner after your request is recorded.</div>
            <label style={{ display: 'block', marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#7c2d12' }}>Already have a BIMED candidate to share with? (Optional)</div>
              <input value={partnerIdentifier} onChange={(e) => setPartnerIdentifier(e.target.value)} placeholder="BIMED ID or candidate@bimedhealthcare.com" style={{ ...input, marginTop: 7 }} />
            </label>
          </div>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#334e68', lineHeight: 1.6 }}>
            <input type='checkbox' checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} />
            <span>I understand the selected accommodation arrangement, the applicable refund trigger, who will submit and pay the employment permit, the permit fee, and that immigration/permit approvals remain subject to the relevant authorities.</span>
          </label>
          <button disabled={busy || !selectedOption || !acknowledged} onClick={() => void acknowledgeAccommodation()} style={{ ...button, width: '100%', maxWidth: 720, opacity: busy || !selectedOption || !acknowledged ? 0.55 : 1 }}>
            {busy ? 'Recording…' : isSharedAccommodationPlan(selectedPlan as any) ? (partnerIdentifier.trim() ? 'Confirm shared plan and issue both invoices' : 'Confirm shared plan and request BIMED partner match') : 'Confirm selections and issue accommodation invoice'}
          </button>
        </> : sharedPrimaryUnlinked ? <>
          <p style={{ lineHeight: 1.7 }}>Your shared accommodation plan is recorded, but the sharing candidate has not yet been linked. Enter their BIMED ID or BIMED email below. BIMED will create their matching invoice and notify them.</p>
          <label style={{ display: 'block', marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>BIMED ID or BIMED email of the candidate sharing with you</div>
            <input value={partnerIdentifier} onChange={(e) => setPartnerIdentifier(e.target.value)} placeholder="e.g. BH-001245 or candidate@bimedhealthcare.com" style={{ ...input, marginTop: 7 }} />
          </label>
          <button disabled={busy || !partnerIdentifier.trim()} onClick={() => void linkExistingSharedPartner()} style={{ ...button, width: '100%', maxWidth: 720, opacity: busy || !partnerIdentifier.trim() ? 0.55 : 1 }}>
            {busy ? 'Linking…' : 'Link sharing candidate and issue their invoice'}
          </button>
        </> : legacyRouteNeeded ? <>
          <p style={{ lineHeight: 1.7 }}>This is a legacy accommodation acknowledgement created before the permit-route choice was added. Select who will submit and pay the employment permit so BIMED can continue the permit workflow.</p>
          <button disabled={busy || !selectedRoute} onClick={() => void selectLegacyRoute()} style={{ ...button, width: '100%', maxWidth: 620, opacity: busy || !selectedRoute ? 0.55 : 1 }}>{busy ? 'Saving…' : 'Save permit submission route'}</button>
        </> : changePlanMode ? <>
          <p style={{ lineHeight: 1.7 }}>You can change between the available accommodation plans, including the <strong>€625 one-month shared plan</strong>, before payment is reported or recorded and before the employment-permit request is submitted. Your existing unpaid invoice will be superseded and the invoice will be updated for the plan you choose. For a shared plan, BIMED will arrange or link the sharing partner after the change is recorded.</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#334e68', lineHeight: 1.6 }}>
            <input type='checkbox' checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 5, flexShrink: 0 }} />
            <span>I confirm the new accommodation plan and understand its payment, refund and accommodation terms.</span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button disabled={busy || changePlanDisabled || isSharedAccommodationPlan(selectedPlan as any)} onClick={() => void changeAccommodationPlan()} style={{ ...button, minWidth: 260, opacity: busy || changePlanDisabled || isSharedAccommodationPlan(selectedPlan as any) ? 0.55 : 1 }}>{busy ? 'Changing plan…' : 'Confirm new plan and issue invoice'}</button>
            <button type='button' disabled={busy} onClick={() => { setChangePlanMode(false); setSelectedPlan(permit.accommodation_plan || ''); setAcknowledged(false); setError(''); }} style={secondary}>Keep current plan</button>
          </div>
        </> : <div style={{ marginTop: 14, padding: 16, borderRadius: 12, background: '#ecfdf5', color: '#166534' }}>
          <strong>Accommodation terms and selections recorded</strong>
          <div style={{ marginTop: 5, lineHeight: 1.6 }}>Your plan and permit route are recorded. You may change the accommodation plan before payment is reported or recorded and before the employment-permit request is submitted. {accommodationReady ? 'The current invoice has been issued and your next workflows are unlocked. If you selected the wrong plan, use Change accommodation plan before making or reporting payment.' : 'The invoice will be issued immediately after confirmation. Your permit/travel workflows remain locked until the invoice is issued.'}</div>
          {canChangeAccommodation && <button type='button' disabled={busy || Boolean(permit.accommodation_share_id)} onClick={() => { setChangePlanMode(true); setAcknowledged(false); setError(''); }} style={{ ...secondary, marginTop: 12 }}>{busy ? 'Opening…' : 'Change accommodation plan'}</button>}
          {invoice && invoiceUrl && ['issued','paid'].includes(invoice.status) && <a href={invoiceUrl} target='_blank' rel='noreferrer' style={{ ...secondary, display: 'inline-block', marginTop: 12 }}>Open accommodation invoice</a>}
        </div>}
      </section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Travel to Ireland</h2><p style={{ color: '#627d98', lineHeight: 1.65 }}>BIMED provides relocation flights and Dublin Airport pickup under both accommodation plans. Once the accommodation invoice has been issued, your virtual flight-planning workspace can unlock. BIMED pays for the actual economy flight and arranges the airport pickup after immigration clearance. You do not buy the flight yourself.</p><button type='button' disabled={!accommodationReady} onClick={() => router.push('/staff/travel')} style={{ ...button, width: '100%', maxWidth: 520, opacity: accommodationReady ? 1 : .55, cursor: accommodationReady ? 'pointer' : 'not-allowed' }}>Open Dublin flight planning</button>{!accommodationReady && <div style={{ marginTop: 8, color: '#854d0e', fontSize: 13 }}>Flight planning unlocks after BIMED issues the accommodation invoice.</div>}</section>

      <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Information BIMED will use</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 18 }}><div><h3>Employee</h3><Info label='Full name' value={packet?.employee?.full_name} /><Info label='Nationality' value={packet?.employee?.nationality} /><Info label='Date of birth' value={packet?.employee?.date_of_birth} /><Info label='Phone' value={packet?.employee?.phone} /><Info label='Address' value={packet?.employee?.residential_address} /></div><div><h3>Employment</h3><Info label='Employer' value={packet?.employment?.employer} /><Info label='Position' value={packet?.employment?.position} /><Info label='Role applied' value={packet?.employment?.role_applied || role} /><Info label='Start date' value={packet?.employment?.start_date} /><Info label='Salary' value={packet?.employment?.annual_salary_eur ? `€${packet.employment.annual_salary_eur.toLocaleString()}` : 'To be confirmed'} /></div></div></section>

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
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#102a43', fontSize: 15, outline: 'none' };
const muted: React.CSSProperties = { color: '#627d98', lineHeight: 1.55 };
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7', minWidth: 0 }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{String(value ?? '—')}</div></div>; }
