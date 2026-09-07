'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Row = Record<string, any>;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };

function dateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-IE');
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function time(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminStaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [staff, setStaff] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [activationUrl, setActivationUrl] = useState('');

  async function load() {
    setError('');
    const response = await fetch(`/api/admin/staff/${params.id}`);
    const data = await response.json();
    if (response.status === 401) { setError('Admin session required.'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load staff member.'); return; }
    setStaff(data.staff); setStatus(data.staff.status || '');
  }

  useEffect(() => { void load(); }, [params.id]);

  async function updateStatus() {
    setBusy('status'); setError('');
    try {
      const response = await fetch('/api/admin/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status', staffId: params.id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update status.');
      setStaff((current) => current ? { ...current, ...data.staff } : current);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update status.'); } finally { setBusy(null); }
  }

  async function rotateActivation() {
    setBusy('activation'); setError('');
    try {
      const response = await fetch('/api/admin/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rotate_activation', staffId: params.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create activation link.');
      setActivationUrl(data.activationUrl || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create activation link.'); } finally { setBusy(null); }
  }

  async function copyActivation() {
    if (!activationUrl) return;
    try { await navigator.clipboard.writeText(activationUrl); }
    catch { setError('The activation link was created, but this browser would not copy it automatically.'); }
  }

  if (!staff) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>{error || 'Loading staff record…'}</main>;

  const shifts: Row[] = staff.shifts || [];
  const leaveRequests: Row[] = staff.leaveRequests || [];
  const payslips: Row[] = staff.payslips || [];
  const auditLog: Row[] = staff.auditLog || [];
  const upcomingShifts = shifts.filter((s) => new Date(s.start_at).getTime() > Date.now() && !['cancelled', 'completed'].includes(s.status)).length;
  const pendingLeave = leaveRequests.filter((leave) => leave.status === 'pending').length;

  return (
    <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/admin/staff')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>← Workforce staff</button>
          <button onClick={() => router.push('/admin/rota')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Open rota manager</button>
        </div>
        {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#fff5f5', color: '#9b2c2c', border: '1px solid #fed7d7' }}>{error}</div>}

        <section style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '4px 0' }}>{staff.preferred_name || staff.full_name}</h1><p style={{ margin: 0, color: '#627d98' }}>{staff.role || 'BIMED Staff'} · <strong>{staff.bimed_id}</strong></p><div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={pill}>{staff.status}</span><span style={pill}>{staff.employment_type || 'Employment type pending'}</span></div></div>
            <div style={{ width: 128, height: 160, overflow: 'hidden', borderRadius: 14, background: '#eef2f7', display: 'grid', placeItems: 'center' }}>{staff.profile_photo_url ? <img src={staff.profile_photo_url} alt='BIMED staff photograph' style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#829ab1' }}>No photograph</span>}</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 18 }}>
          <Metric label='Upcoming shifts' value={upcomingShifts} />
          <Metric label='Pending leave' value={pendingLeave} />
          <Metric label='Payslips' value={payslips.length} />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
          <div style={card}><h2 style={{ marginTop: 0 }}>Employment</h2><Info label='BIMED ID' value={staff.bimed_id} /><Info label='Status' value={staff.status} /><Info label='Role' value={staff.role} /><Info label='Department' value={staff.department} /><Info label='Employment type' value={staff.employment_type} /><Info label='Start date' value={staff.employment_start_date} /><Info label='Primary location' value={staff.primary_location} /></div>
          <div style={card}><h2 style={{ marginTop: 0 }}>Payroll / Irish details</h2><Info label='PPS number' value={staff.pps_number || 'Pending'} /><Info label='PPS status' value={staff.pps_status || 'pending'} /><Info label='Tax status' value={staff.tax_status || 'pending'} /><Info label='Revenue reference' value={staff.revenue_reference || 'Not provided'} /><Info label='IBAN' value={staff.iban || 'Not provided'} /><Info label='BIC' value={staff.bic || 'Not provided'} /><Info label='Bank' value={staff.bank_name || 'Not provided'} /></div>
        </section>

        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Account activation</h2>
          <p style={{ color: '#627d98' }}>Generate a fresh seven-day activation link without exposing passwords or session credentials in the admin UI.</p>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button disabled={busy === 'activation'} onClick={() => void rotateActivation()} style={primaryButton}>{busy === 'activation' ? 'Generating…' : 'Generate activation link'}</button>{activationUrl && <button onClick={() => void copyActivation()} style={secondaryButton}>Copy activation link</button>}</div>
          {activationUrl && <textarea readOnly value={activationUrl} rows={3} style={{ width: '100%', marginTop: 12, padding: 10, border: '1px solid #d9e2ec', borderRadius: 9, boxSizing: 'border-box' }} />}
        </section>

        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Manage staff status</h2><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }}><option value='pre_arrival'>Pre-arrival</option><option value='active'>Active</option><option value='on_leave'>On leave</option><option value='suspended'>Suspended</option><option value='former'>Former</option></select><button disabled={busy === 'status'} onClick={() => void updateStatus()} style={primaryButton}>{busy === 'status' ? 'Saving…' : 'Save status'}</button></div></section>

        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Recent rota</h2>{shifts.length === 0 ? <p style={{ color: '#627d98' }}>No shifts recorded.</p> : <div style={{ display: 'grid', gap: 8 }}>{shifts.map((shift) => <div key={shift.id} style={row}><div><strong>{shift.shift_type}</strong><div style={{ fontSize: 13 }}>{dateLabel(shift.shift_date)} · {time(shift.start_at)}–{time(shift.end_at)}</div><div style={{ fontSize: 12, color: '#627d98' }}>{shift.location || 'BIMED'}{shift.role ? ` · ${shift.role}` : ''}</div></div><span style={statusText}>{shift.status}</span></div>)}</div>}</section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
          <div style={card}><h2 style={{ marginTop: 0 }}>Leave history</h2>{leaveRequests.length === 0 ? <p style={{ color: '#627d98' }}>No leave requests recorded.</p> : leaveRequests.map((leave) => <div key={leave.id} style={row}><div><strong>{leave.leave_type}</strong><div style={{ fontSize: 13 }}>{dateLabel(leave.start_date)} → {dateLabel(leave.end_date)}</div>{leave.reason && <div style={{ fontSize: 12, color: '#627d98' }}>{leave.reason}</div>}</div><span style={statusText}>{leave.status}</span></div>)}</div>
          <div style={card}><h2 style={{ marginTop: 0 }}>Payslips</h2>{payslips.length === 0 ? <p style={{ color: '#627d98' }}>No payslips issued.</p> : payslips.map((slip) => <div key={slip.id} style={row}><div><strong>{dateLabel(slip.period_start)} → {dateLabel(slip.period_end)}</strong><div style={{ fontSize: 13 }}>Gross €{Number(slip.gross_pay || 0).toFixed(2)} · Net €{Number(slip.net_pay || 0).toFixed(2)}</div><div style={{ fontSize: 12, color: '#627d98' }}>Issued {dateTime(slip.issued_at)}</div></div><span style={statusText}>{slip.status || 'issued'}</span></div>)}</div>
        </section>

        <section style={{ ...card, marginTop: 18, marginBottom: 30 }}><h2 style={{ marginTop: 0 }}>Audit trail</h2>{auditLog.length === 0 ? <p style={{ color: '#627d98' }}>No staff audit entries yet.</p> : auditLog.map((entry) => <div key={entry.id} style={row}><div><strong>{entry.event_type}</strong><div style={{ fontSize: 12, color: '#627d98' }}>{dateTime(entry.created_at)} · {entry.actor || 'system'}</div></div><span style={{ fontSize: 12, color: '#627d98' }}>{entry.metadata ? JSON.stringify(entry.metadata) : ''}</span></div>)}</section>
      </div>
    </main>
  );
}

const primaryButton: React.CSSProperties = { padding: '10px 14px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 };
const secondaryButton: React.CSSProperties = { padding: '10px 14px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 700 };
const pill: React.CSSProperties = { padding: '5px 9px', borderRadius: 999, background: '#e6fffa', color: '#0f766e', fontSize: 12, fontWeight: 800 };
const row: React.CSSProperties = { padding: '11px 0', borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' };
const statusText: React.CSSProperties = { fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' };

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={card}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div></div>;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7' }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700 }}>{String(value || '—')}</div></div>;
}
