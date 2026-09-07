'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Staff = Record<string, any>;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };

export default function AdminStaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function load() {
    const response = await fetch(`/api/admin/staff/${params.id}`);
    const data = await response.json();
    if (response.status === 401) { setError('Admin session required.'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load staff member.'); return; }
    setStaff(data.staff); setStatus(data.staff.status || '');
  }

  useEffect(() => { void load(); }, [params.id]);

  async function updateStatus() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status', staffId: params.id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update status.');
      setStaff(data.staff);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update status.'); } finally { setBusy(false); }
  }

  if (!staff) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>{error || 'Loading staff record…'}</main>;

  return (
    <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <button onClick={() => router.push('/admin/staff')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>← Workforce staff</button>
        {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#fff5f5', color: '#9b2c2c' }}>{error}</div>}
        <section style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '4px 0' }}>{staff.preferred_name || staff.full_name}</h1><p style={{ margin: 0, color: '#627d98' }}>{staff.role || 'BIMED Staff'} · <strong>{staff.bimed_id}</strong></p></div>
            <div style={{ width: 128, height: 160, overflow: 'hidden', borderRadius: 14, background: '#eef2f7', display: 'grid', placeItems: 'center' }}>{staff.profile_photo_url ? <img src={staff.profile_photo_url} alt='BIMED staff photograph' style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#829ab1' }}>No photograph</span>}</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
          <div style={card}><h2 style={{ marginTop: 0 }}>Employment</h2><Info label='BIMED ID' value={staff.bimed_id} /><Info label='Status' value={staff.status} /><Info label='Role' value={staff.role} /><Info label='Department' value={staff.department} /><Info label='Employment type' value={staff.employment_type} /><Info label='Start date' value={staff.employment_start_date} /><Info label='Primary location' value={staff.primary_location} /></div>
          <div style={card}><h2 style={{ marginTop: 0 }}>Payroll / Irish details</h2><Info label='PPS number' value={staff.pps_number || 'Pending'} /><Info label='PPS status' value={staff.pps_status || 'pending'} /><Info label='Tax status' value={staff.tax_status || 'pending'} /><Info label='Revenue reference' value={staff.revenue_reference || 'Not provided'} /><Info label='IBAN' value={staff.iban || 'Not provided'} /><Info label='BIC' value={staff.bic || 'Not provided'} /><Info label='Bank' value={staff.bank_name || 'Not provided'} /></div>
        </section>

        <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Manage staff status</h2><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }}><option value='pre_arrival'>Pre-arrival</option><option value='active'>Active</option><option value='on_leave'>On leave</option><option value='suspended'>Suspended</option><option value='former'>Former</option></select><button disabled={busy} onClick={() => void updateStatus()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 }}>{busy ? 'Saving…' : 'Save status'}</button></div></section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div style={{ padding: '8px 0', borderBottom: '1px solid #edf2f7' }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700 }}>{String(value || '—')}</div></div>;
}
