'use client';

import { useEffect, useState } from 'react';

export default function AdminPermitPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [packet, setPacket] = useState<any>(null);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/admin/staff', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load workforce.'); return; }
    const staff = (data.staff || []).filter((item: any) => item.status === 'pre_arrival' || item.application_id);
    const permitRows = [];
    for (const person of staff) {
      const permitResponse = await fetch(`/api/admin/staff/${person.id}/permit`, { cache: 'no-store' });
      if (!permitResponse.ok) continue;
      const permit = await permitResponse.json();
      if (permit.permit) permitRows.push({ staff: person, permit: permit.permit });
    }
    setRows(permitRows);
  }

  useEffect(() => { void load(); }, []);

  async function openCase(id: string) {
    const response = await fetch(`/api/admin/staff/${id}/permit`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load permit case.'); return; }
    setActive({ staff: rows.find((row) => row.staff.id === id)?.staff, permit: data.permit }); setPacket(data.packet);
  }

  async function updateCase(payload: Record<string, unknown>) {
    if (!active?.staff?.id) return;
    const response = await fetch(`/api/admin/staff/${active.staff.id}/permit`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to update the permit case.'); return; }
    setActive((current: any) => current ? { ...current, permit: data.permit } : current);
    void load();
  }

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 28, fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1250, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><div><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED WORKFORCE</div><h1 style={{ margin: '4px 0' }}>Overseas Permit & Sponsorship</h1><p style={{ margin: 0, color: '#627d98' }}>Employer-side permit preparation, accommodation evidence, billing and work-authorisation control.</p></div><a href='/admin/staff' style={secondary}>← Workforce Staff</a></div>
      {error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#fff5f5', color: '#9b2c2c' }}>{error}</div>}
      <section style={{ ...card, marginTop: 18 }}><h2>Overseas cases</h2>{rows.length === 0 ? <p style={{ color: '#627d98' }}>No overseas permit cases are currently open.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Employee','BIMED ID','Role','Permit status','Accommodation','Refund','Work authorisation',''].map((head) => <th key={head} style={{ padding: 10, textAlign: 'left', background: '#f8fafc', color: '#627d98', fontSize: 12 }}>{head}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.staff.id} style={{ borderTop: '1px solid #edf2f7' }}><td style={{ padding: 10 }}><strong>{row.staff.full_name}</strong><div style={{ fontSize: 12, color: '#627d98' }}>{row.staff.email}</div></td><td style={{ padding: 10, fontWeight: 900 }}>{row.staff.bimed_id}</td><td style={{ padding: 10 }}>{row.staff.job_title || row.staff.role}</td><td style={{ padding: 10 }}>{row.permit.status}</td><td style={{ padding: 10 }}>€{Number(row.permit.accommodation_amount_eur || 0).toFixed(2)} · {row.permit.accommodation_period_months || 0} months</td><td style={{ padding: 10 }}>{row.permit.accommodation_refund_status}</td><td style={{ padding: 10 }}>{row.permit.work_authorised ? 'Confirmed' : 'Blocked'}</td><td style={{ padding: 10 }}><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><button onClick={() => void openCase(row.staff.id)} style={secondary}>Open case</button><a href={`/admin/permit/billing/${row.staff.id}`} style={secondary}>Billing</a></div></td></tr>)}</tbody></table></div>}</section>
      {active && <section style={{ ...card, marginTop: 18, marginBottom: 30 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}><div><h2 style={{ marginTop: 0 }}>{active.staff.full_name}</h2><div style={{ color: '#627d98' }}>{active.staff.bimed_id} · {active.staff.job_title || active.staff.role}</div></div><button onClick={() => setActive(null)} style={secondary}>Close</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}><div><h3>Automatic permit packet</h3>{Object.entries(packet?.employee || {}).map(([key, value]) => <Info key={key} label={key.replaceAll('_',' ')} value={value} />)}<h3 style={{ marginTop: 18 }}>Employment</h3>{Object.entries(packet?.employment || {}).map(([key, value]) => <Info key={key} label={key.replaceAll('_',' ')} value={value} />)}</div><div><h3>Accommodation arrangement</h3><Info label='Offered' value={packet?.accommodation?.offered ? 'Yes' : 'No'} /><Info label='Amount' value={`€${Number(packet?.accommodation?.amount_eur || 0).toFixed(2)}`} /><Info label='Period' value={`${packet?.accommodation?.period_months || 0} months`} /><Info label='Refund amount' value={`€${Number(packet?.accommodation?.refund_amount_eur || 0).toFixed(2)}`} /><Info label='Refund instalments' value={packet?.accommodation?.refund_installments} /><Info label='Refund status' value={packet?.accommodation?.refund_status} /><Info label='Terms acknowledged' value={packet?.accommodation?.terms_acknowledged_at || 'Not yet'} /><a href={`/admin/permit/billing/${active.staff.id}`} style={{ ...secondary, display: 'inline-block', marginTop: 10 }}>Open billing workspace</a><h3 style={{ marginTop: 18 }}>Journey controls</h3><select value={active.permit.status} onChange={(e) => void updateCase({ status: e.target.value })} style={input}><option value='requested'>Requested</option><option value='admin_review'>Admin review</option><option value='permit_preparation'>Permit preparation</option><option value='permit_submitted'>Permit submitted</option><option value='permit_granted'>Permit granted</option><option value='permit_refused'>Permit refused</option><option value='visa_preparation'>Visa preparation</option><option value='visa_submitted'>Visa submitted</option><option value='visa_granted'>Visa granted</option><option value='visa_refused'>Visa refused</option><option value='arrived'>Arrived</option><option value='closed'>Closed</option></select><label style={{ display: 'block', marginTop: 12, fontWeight: 800 }}><input type='checkbox' checked={Boolean(active.permit.work_authorised)} onChange={(e) => void updateCase({ work_authorised: e.target.checked })} /> Confirm work authorisation</label><p style={{ color: '#627d98', fontSize: 13, lineHeight: 1.6 }}>Only confirm this when the relevant permission/right-to-work requirement has actually been verified.</p></div></div>
        <div style={{ marginTop: 18, padding: 14, background: '#f8fafc', borderRadius: 10, color: '#627d98', lineHeight: 1.6 }}><strong style={{ color: '#334e68' }}>Compliance note:</strong> the accommodation offer is recorded as an employment onboarding arrangement. It should not be presented to applicants as a guarantee of permit/visa approval or as a replacement for any financial evidence required by Irish immigration authorities.</div>
      </section>}
    </div>
  </main>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const secondary: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', fontWeight: 800, textDecoration: 'none', color: '#334e68' };
const input: React.CSSProperties = { width: '100%', padding: 10, border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' };
function Info({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: '7px 0', borderBottom: '1px solid #edf2f7' }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 700 }}>{String(value ?? '—')}</div></div>; }
