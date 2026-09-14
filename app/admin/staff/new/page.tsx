'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const departments = ['Administration', 'Finance', 'HR', 'Recruitment', 'Operations', 'Management', 'Other'];
const employmentTypes = ['Permanent', 'Fixed-term', 'Part-time', 'Contract'];

export default function NewBimedStaffPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', jobTitle: '', department: 'Administration', employmentType: 'Permanent',
    startDate: '', managerName: '', address: '', city: 'Dublin', county: '', eircode: '', country: 'Ireland',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activationUrl, setActivationUrl] = useState('');
  const [staff, setStaff] = useState<any | null>(null);

  function update(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setActivationUrl('');
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_internal', ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create BIMED staff member.');
      setStaff(data.staff); setActivationUrl(data.activationUrl || '');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create BIMED staff member.');
    } finally { setBusy(false); }
  }

  async function copyActivation() {
    if (activationUrl) await navigator.clipboard.writeText(activationUrl);
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <button onClick={() => router.push('/admin/staff')} style={secondaryButton}>← Workforce staff</button>
          <button onClick={() => router.push('/admin')} style={secondaryButton}>Recruitment dashboard</button>
        </div>
        <section style={card}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: '#0f766e' }}>BIMED Healthcare</div>
          <h1 style={{ margin: '4px 0 6px' }}>Create BIMED staff member</h1>
          <p style={{ color: '#627d98', marginTop: 0 }}>For internal BIMED employees. Care and clinical roles must be created through recruitment.</p>
          {error && <div style={errorBox}>{error}</div>}
          {staff ? (
            <div style={successBox}>
              <strong>Staff record created</strong>
              <div style={{ marginTop: 8 }}>BIMED ID: <strong>{staff.bimed_id}</strong></div>
              <div>Email: {staff.email}</div>
              <div>Job title: {staff.job_title}</div>
              {activationUrl && <><p style={{ marginBottom: 8 }}>Activation link:</p><textarea readOnly value={activationUrl} rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #a7f3d0', borderRadius: 9 }} /><button onClick={() => void copyActivation()} style={{ ...primaryButton, marginTop: 8 }}>Copy activation link</button></>}
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => router.push(`/admin/staff/${staff.id}`)} style={primaryButton}>Open staff record</button>
                <button onClick={() => router.push('/admin/staff/new')} style={secondaryButton}>Create another</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={grid}>
                <Field label="Full name" value={form.fullName} onChange={(v) => update('fullName', v)} required />
                <Field label="Work email" type="email" value={form.email} onChange={(v) => update('email', v)} required />
                <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} />
                <Field label="Job title" value={form.jobTitle} onChange={(v) => update('jobTitle', v)} required />
                <SelectField label="Department" value={form.department} options={departments} onChange={(v) => update('department', v)} />
                <SelectField label="Employment type" value={form.employmentType} options={employmentTypes} onChange={(v) => update('employmentType', v)} />
                <Field label="Start date" type="date" value={form.startDate} onChange={(v) => update('startDate', v)} />
                <Field label="Line manager" value={form.managerName} onChange={(v) => update('managerName', v)} />
                <Field label="Residential address" value={form.address} onChange={(v) => update('address', v)} />
                <Field label="City" value={form.city} onChange={(v) => update('city', v)} />
                <Field label="County" value={form.county} onChange={(v) => update('county', v)} />
                <Field label="Eircode" value={form.eircode} onChange={(v) => update('eircode', v)} />
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button disabled={busy} type="submit" style={primaryButton}>{busy ? 'Creating…' : 'Create BIMED staff account'}</button>
                <button type="button" onClick={() => router.push('/admin/staff')} style={secondaryButton}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label style={{ display: 'grid', gap: 6 }}><span style={labelStyle}>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label style={{ display: 'grid', gap: 6 }}><span style={labelStyle}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 24, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: '#486581' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' };
const primaryButton: React.CSSProperties = { padding: '11px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 };
const secondaryButton: React.CSSProperties = { padding: '10px 14px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', fontWeight: 700 };
const errorBox: React.CSSProperties = { margin: '16px 0', padding: 12, borderRadius: 10, background: '#fff5f5', color: '#9b2c2c', border: '1px solid #fed7d7' };
const successBox: React.CSSProperties = { margin: '16px 0', padding: 16, borderRadius: 12, background: '#ecfdf5', color: '#14532d', border: '1px solid #a7f3d0' };
