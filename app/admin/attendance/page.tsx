'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const input: React.CSSProperties = { padding: 10, border: '1px solid #d9e2ec', borderRadius: 9, boxSizing: 'border-box' };

function formatDate(value?: string | null) { if (!value) return '—'; const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatTime(value?: string | null) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }); }
function duration(row: Row) { if (!row.clock_in_at || !row.clock_out_at) return 'Open'; const minutes = Math.max(0, Math.round((new Date(row.clock_out_at).getTime() - new Date(row.clock_in_at).getTime()) / 60000) - Number(row.break_minutes || 0)); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }

export default function AdminAttendancePage() {
  const router = useRouter();
  const [records, setRecords] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editBreak, setEditBreak] = useState('0');
  const [editNotes, setEditNotes] = useState('');

  async function load() {
    setError('');
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (date) { query.set('from', date); query.set('to', date); }
    const response = await fetch(`/api/admin/attendance?${query.toString()}`);
    if (response.status === 401) { setError('Admin session required.'); return; }
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load attendance.'); return; }
    setRecords(data.attendance || []);
  }

  useEffect(() => { void load(); }, [status, date]);

  async function action(payload: Row, key: string) {
    setBusy(key); setError('');
    try {
      const response = await fetch('/api/admin/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Attendance action failed.');
      setEdit(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Attendance action failed.'); } finally { setBusy(null); }
  }

  function openEditor(row: Row) {
    setEdit(row);
    setEditIn(row.clock_in_at ? new Date(row.clock_in_at).toISOString().slice(0, 16) : '');
    setEditOut(row.clock_out_at ? new Date(row.clock_out_at).toISOString().slice(0, 16) : '');
    setEditBreak(String(row.break_minutes || 0));
    setEditNotes(row.notes || '');
  }

  const counts = useMemo(() => ({ all: records.length, submitted: records.filter((r) => r.status === 'submitted').length, approved: records.filter((r) => ['approved', 'adjusted'].includes(r.status)).length, open: records.filter((r) => r.status === 'open').length }), [records]);

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1380, margin: '0 auto' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 15, marginBottom: 22 }}><div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>Attendance Review</h1><p style={{ margin: 0, color: '#627d98' }}>Review employee clock-in/out records before payroll processing.</p></div><div style={{ display: 'flex', gap: 8 }}><button onClick={() => router.push('/admin/rota')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Rota</button><button onClick={() => router.push('/admin/staff')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Staff</button></div></header>
    {error && <div style={{ ...card, marginBottom: 18, color: '#9b2c2c', borderColor: '#fed7d7', background: '#fff5f5' }}>{error}</div>}
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 18 }}><Metric label='Records' value={counts.all}/><Metric label='Submitted' value={counts.submitted}/><Metric label='Approved' value={counts.approved}/><Metric label='Open' value={counts.open}/></section>
    <section style={{ ...card, marginBottom: 18 }}><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><input type='date' value={date} onChange={(e) => setDate(e.target.value)} style={input}/><select value={status} onChange={(e) => setStatus(e.target.value)} style={input}><option value=''>All statuses</option><option value='open'>Open</option><option value='submitted'>Submitted</option><option value='approved'>Approved</option><option value='adjusted'>Adjusted</option><option value='rejected'>Rejected</option></select><button onClick={() => void load()} style={{ ...input, background: '#fff', fontWeight: 800 }}>Refresh</button></div></section>
    <section style={card}><h2 style={{ marginTop: 0 }}>Timesheets</h2>{records.length === 0 ? <p style={{ color: '#627d98' }}>No attendance records match these filters.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Employee','Shift','Clock in','Clock out','Hours','Status','Actions'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 10, fontSize: 12, color: '#627d98' }}>{h}</th>)}</tr></thead><tbody>{records.map((row) => <tr key={row.id} style={{ borderTop: '1px solid #edf2f7' }}><td style={{ padding: 10 }}><strong>{row.staff?.bimed_id || '—'}</strong><div>{row.staff?.preferred_name || row.staff?.full_name || 'Employee'}</div><div style={{ fontSize: 12, color: '#627d98' }}>{row.staff?.role || ''}</div></td><td style={{ padding: 10 }}>{row.shift?.shift_type || 'Shift'}<div style={{ fontSize: 12, color: '#627d98' }}>{formatDate(row.shift?.shift_date)} · {formatTime(row.shift?.start_at)}–{formatTime(row.shift?.end_at)}</div></td><td style={{ padding: 10 }}>{formatTime(row.clock_in_at)}</td><td style={{ padding: 10 }}>{formatTime(row.clock_out_at)}</td><td style={{ padding: 10, fontWeight: 800 }}>{duration(row)}</td><td style={{ padding: 10 }}>{row.status}</td><td style={{ padding: 10 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{row.status === 'submitted' && <><button disabled={busy === `approve:${row.id}`} onClick={() => void action({ action: 'approve', attendanceId: row.id }, `approve:${row.id}`)} style={{ padding: '7px 9px', border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', fontWeight: 800 }}>{busy === `approve:${row.id}` ? '…' : 'Approve'}</button><button disabled={busy === `reject:${row.id}`} onClick={() => void action({ action: 'reject', attendanceId: row.id }, `reject:${row.id}`)} style={{ padding: '7px 9px', border: '1px solid #fecaca', background: '#fff', borderRadius: 8, color: '#b91c1c', fontWeight: 700 }}>Reject</button></>} {row.clock_in_at && <button onClick={() => openEditor(row)} style={{ padding: '7px 9px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 8, fontWeight: 700 }}>Adjust</button>}</div></td></tr>)}</tbody></table></div>}</section>
    {edit && <div style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Adjust attendance</h2><p style={{ color: '#627d98' }}>{edit.staff?.bimed_id} · {edit.staff?.full_name} · {edit.shift?.shift_date} · {edit.shift?.shift_type}</p><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 10 }}><label style={{ fontSize: 13, fontWeight: 800 }}>Clock in<input type='datetime-local' value={editIn} onChange={(e) => setEditIn(e.target.value)} style={{ ...input, width: '100%', marginTop: 5 }}/></label><label style={{ fontSize: 13, fontWeight: 800 }}>Clock out<input type='datetime-local' value={editOut} onChange={(e) => setEditOut(e.target.value)} style={{ ...input, width: '100%', marginTop: 5 }}/></label><label style={{ fontSize: 13, fontWeight: 800 }}>Break minutes<input type='number' min='0' max='720' value={editBreak} onChange={(e) => setEditBreak(e.target.value)} style={{ ...input, width: '100%', marginTop: 5 }}/></label></div><label style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 800 }}>Notes<textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} style={{ ...input, width: '100%', marginTop: 5 }}/></label><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button disabled={busy === `adjust:${edit.id}`} onClick={() => void action({ action: 'adjust', attendanceId: edit.id, clockInAt: new Date(editIn).toISOString(), clockOutAt: new Date(editOut).toISOString(), breakMinutes: Number(editBreak), notes: editNotes }, `adjust:${edit.id}`)} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 }}>{busy === `adjust:${edit.id}` ? 'Saving…' : 'Save adjustment'}</button><button onClick={() => setEdit(null)} style={{ padding: '10px 14px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Close</button></div></div>}
  </div></main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div style={card}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div></div>; }
