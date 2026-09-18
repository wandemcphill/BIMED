'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PacketMode, PacketSlug } from '@/lib/document-packets';
import { supportingDocumentRequirements, missingSupportingDocuments } from '@/lib/supporting-document-requirements';

type Application = {
  full_name: string;
  role_applied: string | null;
  start_date: string | null;
  country_of_residence: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
};

type Props = {
  token: string;
  slug: PacketSlug;
  title: string;
  description: string;
  mode: PacketMode;
  application: Application;
  initialResponse: Record<string, unknown>;
  completedAt?: string | null;
};

type ChecklistAudience = 'candidate' | 'bimed';
type ChecklistStage = 'now' | 'upcoming';

type ChecklistItem = {
  key: string;
  label: string;
  audience: ChecklistAudience;
  stage: ChecklistStage;
  helper?: string;
};

const checklistMap: Partial<Record<PacketSlug, ChecklistItem[]>> = {
  'supporting-documents': [
    { key: 'passport', label: 'Passport or approved identity evidence ready.', audience: 'candidate', stage: 'now' },
    { key: 'address', label: 'Current address evidence ready, where requested.', audience: 'candidate', stage: 'now' },
    { key: 'cv', label: 'Current CV ready.', audience: 'candidate', stage: 'now' },
    { key: 'employment', label: 'Previous employment and reference details ready.', audience: 'candidate', stage: 'now' },
    { key: 'qualifications', label: 'Qualification certificates ready.', audience: 'candidate', stage: 'now' },
    { key: 'registration', label: 'Professional registration/licence evidence ready, where applicable.', audience: 'candidate', stage: 'now' },
    { key: 'training', label: 'Relevant training certificates ready.', audience: 'candidate', stage: 'now' },
    {
      key: 'permission',
      label: 'Employment permit / work-permission evidence',
      audience: 'bimed',
      stage: 'upcoming',
      helper: 'BIMED controls this status. Leave it pending until the relevant permit or work permission has actually been granted and verified.',
    },
    { key: 'other', label: 'Any additional documents specifically requested by BIMED are ready.', audience: 'candidate', stage: 'now' },
  ],
  'international-relocation': [
    { key: 'offer', label: 'BIMED employment offer and contract accepted or signed.', audience: 'candidate', stage: 'now' },
    { key: 'identity', label: 'Identity information confirmed.', audience: 'candidate', stage: 'now' },
    { key: 'route', label: 'International recruitment route confirmed.', audience: 'candidate', stage: 'now' },
    { key: 'passport', label: 'Passport valid for intended travel.', audience: 'candidate', stage: 'now' },
    {
      key: 'permission',
      label: 'Employment permit / immigration permission',
      audience: 'bimed',
      stage: 'upcoming',
      helper: 'BIMED will update this when the applicable permit / immigration step is submitted, granted and verified.',
    },
    {
      key: 'travel',
      label: 'Proposed travel date shared with BIMED, if known.',
      audience: 'candidate',
      stage: 'now',
      helper: 'A proposed date is optional. BIMED will confirm the final travel date after the permit, visa and travel arrangements are ready.',
    },
    {
      key: 'accommodation',
      label: 'Accommodation allocation confirmed.',
      audience: 'bimed',
      stage: 'upcoming',
      helper: 'BIMED will provide the allocated accommodation details when confirmed.',
    },
    {
      key: 'arrival',
      label: 'Airport and arrival plan confirmed.',
      audience: 'bimed',
      stage: 'upcoming',
      helper: 'BIMED will confirm airport pickup and arrival arrangements after travel is booked.',
    },
    {
      key: 'induction',
      label: 'First reporting / induction appointment confirmed.',
      audience: 'bimed',
      stage: 'upcoming',
      helper: 'BIMED will provide the confirmed reporting location and induction date.',
    },
    { key: 'contacts', label: 'Emergency and BIMED contact details saved.', audience: 'candidate', stage: 'now' },
    { key: 'documents', label: 'Critical documents retained securely in digital and physical form.', audience: 'candidate', stage: 'now' },
    { key: 'first-week', label: 'First-week induction and service orientation completed.', audience: 'bimed', stage: 'upcoming' },
    { key: 'training', label: 'Required mandatory training completed or scheduled.', audience: 'bimed', stage: 'upcoming' },
    { key: 'portal', label: 'Rota and attendance access confirmed.', audience: 'bimed', stage: 'upcoming' },
    { key: 'month-one', label: 'First-month check-in completed and outstanding actions understood.', audience: 'bimed', stage: 'upcoming' },
  ],
};

function fieldLabel(label: string) {
  return <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#43525c', marginBottom: 7 }}>{label}</span>;
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #cfd9df', borderRadius: 10, fontSize: 15, background: '#fff' };
}

function Button({ children, disabled, onClick, kind = 'primary' }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; kind?: 'primary' | 'secondary' }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ padding: '11px 16px', borderRadius: 10, border: kind === 'primary' ? 0 : '1px solid #cfd9df', background: kind === 'primary' ? '#0a8ec6' : '#fff', color: kind === 'primary' ? '#fff' : '#243039', fontWeight: 800, opacity: disabled ? .55 : 1 }}>{children}</button>;
}

export default function CandidatePacketInteractive({ token, slug, title, description, mode, application, initialResponse, completedAt }: Props) {
  const [response, setResponse] = useState<Record<string, any>>(initialResponse || {});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(!!initialResponse && Object.keys(initialResponse).length > 0);
  const [complete, setComplete] = useState(Boolean(completedAt));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { setResponse(initialResponse || {}); setSaved(Boolean(initialResponse && Object.keys(initialResponse).length)); setComplete(Boolean(completedAt)); }, [initialResponse, completedAt]);

  const setValue = (key: string, value: unknown) => setResponse((current) => ({ ...current, [key]: value }));

  const save = async (completeNow = false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const responseApi = await fetch(`/api/candidate/packet/${token}`, {
        method: completeNow ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      const data = await responseApi.json();
      if (!responseApi.ok) throw new Error(data.error || 'Unable to save your information.');
      setSaved(true);
      setComplete(Boolean(data.completed_at));
      setMessage(completeNow ? 'Submitted to BIMED. Your recruitment team can now see this information.' : 'Saved. You can return to this link and continue later.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save your information.');
    } finally {
      setBusy(false);
    }
  };

  const checklist = checklistMap[slug] || [];
  const supportingRequirements = supportingDocumentRequirements(application.role_applied);
  const registrationEvidenceRequired = supportingRequirements.registrationRequired;
  const checked = useMemo(() => new Set<string>(Array.isArray(response.checked) ? response.checked : []), [response.checked]);

  const toggleCheck = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    setValue('checked', Array.from(next));
  };

  if (mode === 'acknowledgement') {
    const acknowledged = response.acknowledged === true;
    return <PacketShell title={title} description={description} completed={complete} saved={saved} error={error} message={message}>
      <div style={{ background: '#f8fbfc', border: '1px solid #d7e1e6', borderRadius: 12, padding: 16 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.55 }}>
          <input type="checkbox" checked={acknowledged} onChange={(e) => setValue('acknowledged', e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
          <span>I have read this document and understand that the formal employment contract, signed documents and current BIMED policies take precedence where applicable.</span>
        </label>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <Button disabled={busy || !acknowledged || complete} onClick={() => void save(true)}>{complete ? 'Already submitted' : busy ? 'Submitting…' : 'Confirm and submit'}</Button>
        <Button kind="secondary" disabled={busy} onClick={() => void save(false)}>Save progress</Button>
      </div>
    </PacketShell>;
  }

  if (mode === 'checklist') {
    return <PacketShell title={title} description={description} completed={complete} saved={saved} error={error} message={message}>
      <div style={{ display: 'grid', gap: 12 }}>
        {checklist.map((item) => item.audience === 'bimed' || item.stage === 'upcoming'
          ? <div key={item.key} style={{ padding: 13, border: '1px solid #dce4e8', borderRadius: 10, background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div><strong style={{ display: 'block', lineHeight: 1.45 }}>{item.label}</strong><span style={{ display: 'block', marginTop: 5, fontSize: 12, color: '#627d98', lineHeight: 1.5 }}>{item.helper || 'BIMED will update this item when it becomes applicable.'}</span></div>
                <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 999, background: '#fff8e1', color: '#975a16', fontSize: 11, fontWeight: 900 }}>BIMED / UPCOMING</span>
              </div>
            </div>
          : item.key === 'registration' && !registrationEvidenceRequired
            ? <div key={item.key} style={{ padding: 12, border: '1px solid #dce4e8', borderRadius: 10, background: '#f8fbfc' }}>
                <strong style={{ display: 'block', lineHeight: 1.45 }}>{item.label}</strong>
                <span style={{ display: 'block', marginTop: 5, fontSize: 12, color: '#627d98', lineHeight: 1.5 }}>
                  This item is not required to submit this checklist for your current role. Only provide professional registration/licence evidence where BIMED specifically requests it or the role is professionally regulated.
                </span>
              </div>
            : <label key={item.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, border: '1px solid #dce4e8', borderRadius: 10, background: '#fff' }}>
                <input type="checkbox" checked={checked.has(item.key)} onChange={() => toggleCheck(item.key)} style={{ marginTop: 3, width: 18, height: 18 }} />
                <span style={{ lineHeight: 1.45 }}>{item.label}</span>
              </label>
        )}
      </div>
      <div style={{ marginTop: 16, padding: 12, background: '#f8fbfc', borderRadius: 10, color: '#59676f', fontSize: 13 }}>
        Candidate checkboxes confirm that you have the item ready or have completed the candidate-side action. Professional registration/licence evidence is only a submission requirement where it applies to the role.
      </div>
      <div style={{ marginTop: 10, padding: 12, background: '#fff8e1', border: '1px solid #f2d28a', borderRadius: 10, color: '#73520f', fontSize: 13, lineHeight: 1.5 }}>
        {registrationEvidenceRequired
          ? 'For this role, the professional registration/licence evidence item is required before submission.'
          : 'For your current role, the professional registration/licence item does not block submission. If BIMED later needs role-specific evidence, the recruitment team will contact you.'}
      </div>
      {(() => {
        const missing = missingSupportingDocuments(application.role_applied, response.checked);
        if (!missing.length || complete) return null;
        return <div style={{ marginTop: 10, padding: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, color: '#9a3412', fontSize: 13, lineHeight: 1.5 }}>
          <strong>Before you submit:</strong> please confirm the following items are ready:
          <ul style={{ margin: '7px 0 0 18px' }}>{missing.map((item) => <li key={item.key}>{item.label}</li>)}</ul>
          <div style={{ marginTop: 7 }}>The Submit button remains available so that any missing requirement is explained rather than appearing unresponsive.</div>
        </div>;
      })()}
      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <Button disabled={busy} onClick={() => void save(false)}>Save progress</Button>
        <Button disabled={busy || complete} onClick={() => void save(true)}>{complete ? 'Already submitted' : busy ? 'Submitting…' : 'Submit current checklist'}</Button>
      </div>
    </PacketShell>;
  }

  if (slug === 'international-sponsorship') {
    return <PacketShell title={title} description={description} completed={complete} saved={saved} error={error} message={message}>
      <div style={{ display: 'grid', gap: 14 }}>
        <ReadOnlyGrid application={application} />
        <div><label>{fieldLabel('Passport number')}<input value={response.passportNumber || ''} onChange={(e) => setValue('passportNumber', e.target.value)} style={inputStyle()} autoComplete="off" /></label></div>
        <div><label>{fieldLabel('Passport expiry date')}<input type="date" value={response.passportExpiry || ''} onChange={(e) => setValue('passportExpiry', e.target.value)} style={inputStyle()} /></label></div>
        <SelectField label="Do you currently live outside Ireland?" value={response.livesOutsideIreland} options={['Yes', 'No']} onChange={(v) => setValue('livesOutsideIreland', v)} />
        <SelectField label="Do you currently hold permission to live in Ireland?" value={response.irelandResidencePermission} options={['Yes', 'No']} onChange={(v) => setValue('irelandResidencePermission', v)} />
        <SelectField label="Do you currently have permission to work in Ireland?" value={response.irelandWorkPermission} options={['Yes', 'No']} onChange={(v) => setValue('irelandWorkPermission', v)} />
        <SelectField label="Will you require an employment permit for this role?" value={response.requiresPermit} options={['Yes', 'No', 'Unsure']} onChange={(v) => setValue('requiresPermit', v)} />
        <SelectField label="Have you previously held an Irish employment permit or immigration permission?" value={response.previousIrishPermission} options={['Yes', 'No']} onChange={(v) => setValue('previousIrishPermission', v)} />
        <SelectField label="Have you ever been refused an Irish immigration permission or visa?" value={response.previousRefusal} options={['Yes', 'No']} onChange={(v) => setValue('previousRefusal', v)} />
        <div>
          <label>{fieldLabel('Preferred / earliest realistic relocation date (optional)')}
            <input type="date" value={response.relocationDate || ''} onChange={(e) => setValue('relocationDate', e.target.value)} style={inputStyle()} />
          </label>
          <div style={{ marginTop: 6, fontSize: 12, color: '#627d98', lineHeight: 1.5 }}>This is a proposed date only. Your contractual employment start date and your final travel/relocation date are separate. BIMED will confirm the final relocation plan after the employment-permit, visa and travel arrangements are ready. You may leave this blank and BIMED will record it as To Be Confirmed.</div>
        </div>
        <div><label>{fieldLabel('Anything that could affect your proposed start date?')}<textarea value={response.startDateConditions || ''} onChange={(e) => setValue('startDateConditions', e.target.value)} rows={4} style={{ ...inputStyle(), resize: 'vertical' }} /></label></div>
        <div style={{ background: '#e8f4f8', border: '1px solid #cfe2eb', borderRadius: 12, padding: 15, lineHeight: 1.55 }}><strong>Permit submission route</strong><p style={{ margin: '7px 0 0' }}>BIMED will record whether its legal team or the candidate / recruitment agency will submit the employment-permit application. This is controlled in the Employment Permit & Sponsorship workspace and is not selected in this recruitment information form.</p></div>
        <div style={{ background: '#f8fbfc', border: '1px solid #d7e1e6', borderRadius: 12, padding: 15 }}><strong>Candidate declaration</strong><p style={{ lineHeight: 1.6, marginBottom: 10 }}>I confirm that the information I have supplied in this pack is true and complete to the best of my knowledge. I understand that BIMED may verify it and that immigration and employment-permit decisions are made by the relevant authorities.</p><label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={response.declaration === true} onChange={(e) => setValue('declaration', e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} /><span>I confirm the declaration above.</span></label></div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}><Button disabled={busy} onClick={() => void save(false)}>Save progress</Button><Button disabled={busy || response.declaration !== true || !response.passportNumber || !response.passportExpiry || complete} onClick={() => void save(true)}>{complete ? 'Submitted' : busy ? 'Submitting…' : 'Submit sponsorship information'}</Button></div>
    </PacketShell>;
  }

  if (slug === 'welcome-to-ireland') {
    const confirmed = response.arrangementAcknowledged === true;
    return <PacketShell title={title} description={description} completed={complete} saved={saved} error={error} message={message}>
      <div style={{ display: 'grid', gap: 14 }}>
        <ReadOnlyGrid application={application} />
        <div>
          <label>{fieldLabel('Preferred / proposed arrival date (optional)')}<input type="date" value={response.arrivalDate || ''} onChange={(e) => setValue('arrivalDate', e.target.value)} style={inputStyle()} /></label>
          <div style={{ marginTop: 6, fontSize: 12, color: '#627d98', lineHeight: 1.5 }}>Optional. This is not a confirmed travel date. BIMED will confirm the final arrival date after permit, visa and flight arrangements are completed.</div>
        </div>
        <div>
          <label>{fieldLabel('Preferred airport / point of arrival (optional)')}<input value={response.arrivalPoint || ''} onChange={(e) => setValue('arrivalPoint', e.target.value)} style={inputStyle()} placeholder="Optional preference, e.g. Dublin Airport" /></label>
          <div style={{ marginTop: 6, fontSize: 12, color: '#627d98' }}>BIMED will confirm the actual airport and arrival arrangement.</div>
        </div>
        <InfoField label="BIMED arrival contact" value="To Be Confirmed by BIMED before travel" />
        <InfoField label="Accommodation details" value="To Be Confirmed by BIMED after allocation" />
        <InfoField label="First reporting / induction location" value="To Be Confirmed by BIMED" />
        <InfoField label="First shift / induction date" value="To Be Confirmed by BIMED" />
        <div>
          <label>{fieldLabel('Important arrival notes')}<textarea value={response.notes || ''} onChange={(e) => setValue('notes', e.target.value)} rows={4} style={{ ...inputStyle(), resize: 'vertical' }} placeholder="Tell BIMED about anything known that could affect travel or arrival." /></label>
        </div>
        <div style={{ background: '#f8fbfc', border: '1px solid #d7e1e6', borderRadius: 12, padding: 15, lineHeight: 1.6 }}>
          <strong>What happens next</strong>
          <p style={{ margin: '7px 0 0' }}>You are not expected to invent or guess airport pickup, accommodation, reporting location or induction details. BIMED will populate those fields when they are confirmed.</p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}><input type="checkbox" checked={confirmed} onChange={(e) => setValue('arrangementAcknowledged', e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} /><span>I understand that the arrival details shown above may remain To Be Confirmed until BIMED finalises my permit, visa, travel and accommodation arrangements.</span></label>
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <Button disabled={busy} onClick={() => void save(false)}>Save progress</Button>
        <Button disabled={busy || !confirmed || complete} onClick={() => void save(true)}>{complete ? 'Submitted' : busy ? 'Submitting…' : 'Confirm and submit arrival information'}</Button>
      </div>
    </PacketShell>;
  }

  return null;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #e0e8ec', borderRadius: 10 }}>
    <div style={{ fontSize: 12, color: '#66717a' }}>{label}</div>
    <strong style={{ display: 'block', marginTop: 3 }}>{value}</strong>
  </div>;
}

function ReadOnlyGrid({ application }: { application: Application }) {
  const rows = [
    ['Name', application.full_name],
    ['Role', application.role_applied || 'To be confirmed'],
    ['Start date', application.start_date || 'To be confirmed'],
    ['Current country', application.country_of_residence || 'Not provided'],
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>{rows.map(([label, value]) => <div key={label} style={{ padding: 12, background: '#f8fbfc', border: '1px solid #e0e8ec', borderRadius: 10 }}><div style={{ fontSize: 12, color: '#66717a' }}>{label}</div><strong style={{ display: 'block', marginTop: 3 }}>{value}</strong></div>)}</div>;
}

function SelectField({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (value: string) => void }) {
  return <div><span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#43525c', marginBottom: 7 }}>{label}</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{options.map((option) => <button type="button" key={option} onClick={() => onChange(option)} style={{ padding: '9px 12px', borderRadius: 999, border: `1px solid ${value === option ? '#0a8ec6' : '#cfd9df'}`, background: value === option ? '#e8f4f8' : '#fff', color: '#243039', fontWeight: 700 }}>{option}</button>)}</div></div>;
}

function PacketShell({ title, description, completed, saved, error, message, children }: { title: string; description: string; completed: boolean; saved: boolean; error: string; message: string; children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: '1px solid #d7e1e6', borderRadius: 14, padding: 24 }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
      <div><h1 style={{ margin: '0 0 7px', color: '#163247' }}>{title}</h1><p style={{ margin: 0, color: '#66717a', lineHeight: 1.55 }}>{description}</p></div>
      <span style={{ padding: '5px 9px', borderRadius: 999, background: completed ? '#e8f7ed' : '#e8f4f8', color: completed ? '#16723a' : '#0a6f95', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{completed ? 'Submitted' : saved ? 'Saved' : 'Not started'}</span>
    </div>
    {error && <div style={{ background: '#fff5f5', border: '1px solid #f0caca', color: '#8a2f2f', padding: 12, borderRadius: 10, marginBottom: 14 }}>{error}</div>}
    {message && <div style={{ background: '#edf9f1', border: '1px solid #c9e8d1', color: '#17683a', padding: 12, borderRadius: 10, marginBottom: 14 }}>{message}</div>}
    {children}
  </div>;
}
