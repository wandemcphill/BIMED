'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };

function formatTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function duration(clockIn?: string | null, clockOut?: string | null, breaks = 0) {
  if (!clockIn || !clockOut) return 'Open';
  const minutes = Math.max(0, Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000) - Number(breaks || 0));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function StaffAttendancePage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Row[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');

  async function load() {
    setError('');
    const response = await fetch('/api/staff/attendance');
    if (response.status === 401) { router.replace('/staff/login'); return; }
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load attendance.'); return; }
    setShifts(data.shifts || []);
    setRecords(data.attendance || []);
  }

  useEffect(() => { void load(); }, []);

  async function act(shiftId: string, action: 'clock_in' | 'clock_out') {
    setBusy(`${action}:${shiftId}`); setError('');
    try {
      const response = await fetch('/api/staff/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, shiftId, breakMinutes: action === 'clock_out' ? Number(breakMinutes || 0) : undefined, notes: action === 'clock_out' ? notes : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Attendance action failed.');
      setNotes('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Attendance action failed.'); } finally { setBusy(null); }
  }

  const open = useMemo(() => records.find((record) => record.status === 'open' && record.clock_in_at && !record.clock_out_at), [records]);

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7fb', fontFamily: 'system-ui', color: '#102a43', padding: '32px 5vw' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 15, alignItems: 'end', marginBottom: 22 }}>
          <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>Time & Attendance</h1><p style={{ margin: 0, color: '#627d98' }}>Clock against your assigned rota and submit accurate timesheets for BIMED review.</p></div>
          <button onClick={() => router.push('/staff')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' }}>Back to portal</button>
        </header>
        {error && <div style={{ ...card, marginBottom: 18, color: '#9b2c2c', borderColor: '#fed7d7', background: '#fff5f5' }}>{error}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(300px,.7fr)', gap: 18 }}>
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Eligible shifts</h2>
            {shifts.length === 0 ? <p style={{ color: '#627d98' }}>No current or upcoming assigned shifts are eligible for attendance.</p> : shifts.map((shift) => {
              const record = records.find((item) => item.shift_id === shift.id);
              const canIn = !record?.clock_in_at;
              const canOut = Boolean(record?.clock_in_at && !record?.clock_out_at);
              return <div key={shift.id} style={{ border: '1px solid #e5eaf0', borderRadius: 12, padding: 15, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{shift.shift_type}</strong><span style={{ fontSize: 12, fontWeight: 800 }}>{record?.status || 'Not started'}</span></div>
                <div style={{ marginTop: 5 }}>{formatDate(shift.shift_date)} · {formatTime(shift.start_at)}–{formatTime(shift.end_at)}</div>
                <div style={{ color: '#627d98', fontSize: 12 }}>{shift.location || 'BIMED'}{shift.role ? ` · ${shift.role}` : ''}</div>
                {record?.clock_in_at && <div style={{ marginTop: 8, fontSize: 13 }}>Clocked in {formatTime(record.clock_in_at)}{record.clock_out_at ? ` · out ${formatTime(record.clock_out_at)} · ${duration(record.clock_in_at, record.clock_out_at, record.break_minutes)}` : ''}</div>}
                <div style={{ marginTop: 11 }}>{canIn && <button onClick={() => void act(shift.id, 'clock_in')} disabled={busy === `clock_in:${shift.id}`} style={{ padding: '9px 13px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 }}>{busy === `clock_in:${shift.id}` ? 'Clocking in…' : 'Clock in'}</button>}{canOut && <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 8, alignItems: 'center' }}><input type='number' min='0' max='720' value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} placeholder='Break mins' style={{ padding: 9, border: '1px solid #d9e2ec', borderRadius: 8 }} /><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder='Optional timesheet note' style={{ padding: 9, border: '1px solid #d9e2ec', borderRadius: 8 }} /><button onClick={() => void act(shift.id, 'clock_out')} disabled={busy === `clock_out:${shift.id}`} style={{ padding: '9px 13px', border: 0, borderRadius: 9, background: '#334e68', color: '#fff', fontWeight: 800 }}>{busy === `clock_out:${shift.id}` ? 'Clocking out…' : 'Clock out'}</button></div>}</div>
              </div>;
            })}
          </div>

          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Live status</h2>
            {open ? <><div style={{ fontSize: 13, color: '#627d98' }}>Currently clocked in</div><div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>{formatTime(open.clock_in_at)}</div><div style={{ marginTop: 5, color: '#627d98' }}>{open.shift?.shift_type || 'Current shift'}</div></> : <><div style={{ fontSize: 13, color: '#627d98' }}>Status</div><div style={{ fontSize: 27, fontWeight: 900, marginTop: 4 }}>Not clocked in</div><div style={{ color: '#627d98', marginTop: 5 }}>Use the shift card to start your working time.</div></>}
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #edf2f7' }}><div style={{ fontSize: 13, color: '#627d98' }}>Submitted records</div><div style={{ fontSize: 28, fontWeight: 900 }}>{records.filter((r) => r.status !== 'open').length}</div></div>
          </div>
        </section>

        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Timesheet history</h2>
          {records.length === 0 ? <p style={{ color: '#627d98' }}>No attendance records yet.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left', padding: 10 }}>Shift</th><th style={{ textAlign: 'left', padding: 10 }}>In</th><th style={{ textAlign: 'left', padding: 10 }}>Out</th><th style={{ textAlign: 'left', padding: 10 }}>Hours</th><th style={{ textAlign: 'left', padding: 10 }}>Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} style={{ borderTop: '1px solid #edf2f7' }}><td style={{ padding: 10 }}>{record.shift?.shift_type || 'Shift'}<div style={{ fontSize: 12, color: '#627d98' }}>{record.shift?.shift_date || ''}</div></td><td style={{ padding: 10 }}>{formatTime(record.clock_in_at)}</td><td style={{ padding: 10 }}>{formatTime(record.clock_out_at)}</td><td style={{ padding: 10, fontWeight: 800 }}>{duration(record.clock_in_at, record.clock_out_at, record.break_minutes)}</td><td style={{ padding: 10 }}>{record.status}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  );
}
