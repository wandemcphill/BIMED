'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = Record<string, any>;

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20,
  boxShadow: '0 8px 28px rgba(15,23,42,.04)',
};

function time(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StaffRotaPage() {
  const router = useRouter();
  const [assigned, setAssigned] = useState<Row[]>([]);
  const [available, setAvailable] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [swapTargets, setSwapTargets] = useState<Row[]>([]);
  const [swapFor, setSwapFor] = useState('');
  const [swapTarget, setSwapTarget] = useState('');
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError('');
    const response = await fetch('/api/staff/rota');
    if (response.status === 401) { router.replace('/staff/login'); return; }
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'Unable to load rota.'); return; }
    setAssigned(data.shifts || []);
    setAvailable(data.availableShifts || []);
    setRequests(data.requests || []);
    setLeaveRequests(data.leaveRequests || []);
  }

  useEffect(() => { void load(); }, []);

  async function act(payload: Row, key: string) {
    setBusy(key); setError('');
    try {
      const response = await fetch('/api/staff/rota', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed.');
      await load();
      setSwapFor(''); setSwapTarget('');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.');
    } finally { setBusy(null); }
  }

  async function loadSwapTargets(shiftId: string) {
    setSwapFor(shiftId); setSwapTarget(''); setError('');
    const response = await fetch(`/api/staff/rota?swap_for=${encodeURIComponent(shiftId)}`);
    const data = await response.json();
    if (!response.ok) { setSwapTargets([]); setError(data.error || 'Unable to load swap options.'); return; }
    setSwapTargets(data.swapCandidates || []);
  }

  const pendingCancellationShiftIds = useMemo(() => new Set(requests.filter((r) => r.request_type === 'cancellation' && r.status === 'pending').map((r) => r.shift_id)), [requests]);

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7fb', fontFamily: 'system-ui', color: '#102a43', padding: '32px 5vw' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 20, marginBottom: 22 }}>
          <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>My Rota & Shifts</h1><p style={{ margin: 0, color: '#627d98' }}>Your permanent BIMED workforce workspace.</p></div>
          <button onClick={() => router.push('/staff')} style={{ padding: '10px 14px', background: '#fff', border: '1px solid #d9e2ec', borderRadius: 9 }}>Back to portal</button>
        </header>

        {error && <div style={{ background: '#fff5f5', color: '#9b2c2c', border: '1px solid #fed7d7', padding: 12, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(340px, .8fr)', gap: 18 }}>
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Confirmed / Assigned</h2>
            {assigned.length === 0 ? <p style={{ color: '#627d98' }}>No assigned shifts.</p> : assigned.map((shift) => (
              <div key={shift.id} style={{ padding: 15, border: '1px solid #e5eaf0', borderRadius: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{shift.shift_type}</strong><span style={{ fontSize: 12, fontWeight: 800 }}>{shift.status}</span></div>
                <div style={{ marginTop: 4 }}>{dateLabel(shift.shift_date)} · {time(shift.start_at)}–{time(shift.end_at)}</div>
                <div style={{ fontSize: 12, color: '#627d98' }}>{shift.location || 'BIMED'}{shift.role ? ` · ${shift.role}` : ''}{shift.break_minutes ? ` · ${shift.break_minutes} min break` : ''}</div>
                {!['cancelled', 'completed'].includes(shift.status) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                    {!pendingCancellationShiftIds.has(shift.id) && <button onClick={() => { const reason = prompt('Why are you requesting this shift be cancelled?'); if (reason !== null) void act({ action: 'request_cancellation', shiftId: shift.id, reason }, `cancel:${shift.id}`); }} disabled={busy === `cancel:${shift.id}`} style={{ padding: '8px 11px', border: '1px solid #fecaca', background: '#fff', borderRadius: 8, color: '#b91c1c' }}>{busy === `cancel:${shift.id}` ? 'Sending…' : 'Request cancellation'}</button>}
                    <button onClick={() => void loadSwapTargets(shift.id)} style={{ padding: '8px 11px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 8 }}>Request swap</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={card}>
            <h2 style={{ marginTop: 0 }}>Open Shifts</h2>
            <p style={{ color: '#627d98', marginTop: -4 }}>Request extra work directly from the BIMED rota.</p>
            {available.length === 0 ? <p style={{ color: '#627d98' }}>No open shifts are currently available.</p> : available.map((shift) => (
              <div key={shift.id} style={{ padding: 14, border: '1px solid #e5eaf0', borderRadius: 12, marginBottom: 10 }}>
                <strong>{shift.shift_type}</strong><div>{dateLabel(shift.shift_date)} · {time(shift.start_at)}–{time(shift.end_at)}</div><div style={{ fontSize: 12, color: '#627d98' }}>{shift.location || 'BIMED'}{shift.role ? ` · ${shift.role}` : ''}</div>
                <button onClick={() => void act({ action: 'request_shift', shiftId: shift.id }, `request:${shift.id}`)} disabled={busy === `request:${shift.id}`} style={{ marginTop: 9, padding: '8px 11px', border: 0, background: '#0f766e', borderRadius: 8, color: '#fff', fontWeight: 800 }}>{busy === `request:${shift.id}` ? 'Requesting…' : 'Request shift'}</button>
              </div>
            ))}
          </div>
        </section>

        {swapFor && <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Choose a shift to swap</h2><p style={{ color: '#627d98' }}>Select another future assigned shift. BIMED will review and approve the swap before either rota changes.</p>{swapTargets.length === 0 ? <p style={{ color: '#627d98' }}>No eligible swap shifts were found.</p> : <div style={{ display: 'grid', gap: 9 }}>{swapTargets.map((target) => <button key={target.id} onClick={() => setSwapTarget(target.id)} style={{ textAlign: 'left', padding: 13, borderRadius: 10, border: swapTarget === target.id ? '2px solid #0f766e' : '1px solid #d9e2ec', background: '#fff' }}><strong>{target.staff?.full_name || 'BIMED colleague'}</strong><div style={{ fontSize: 13 }}>{dateLabel(target.shift_date)} · {time(target.start_at)}–{time(target.end_at)} · {target.shift_type}</div><div style={{ fontSize: 12, color: '#627d98' }}>{target.location || 'BIMED'}{target.role ? ` · ${target.role}` : ''}</div></button>)}</div>}{swapTarget && <button onClick={() => void act({ action: 'request_swap', shiftId: swapFor, requestedShiftId: swapTarget, reason: 'Staff requested shift swap.' }, `swap:${swapFor}:${swapTarget}`)} disabled={busy === `swap:${swapFor}:${swapTarget}`} style={{ marginTop: 12, padding: '10px 14px', border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, fontWeight: 800 }}>{busy === `swap:${swapFor}:${swapTarget}` ? 'Sending request…' : 'Submit swap request'}</button>}</section>}

        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Leave</h2>
          <form onSubmit={(event) => { event.preventDefault(); void act({ action: 'request_leave', startDate: leaveStart, endDate: leaveEnd, leaveType, reason: leaveReason }, 'leave'); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)} style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }}><option value="annual">Annual leave</option><option value="sick">Sick leave</option><option value="other">Other leave</option></select>
            <input required type="date" value={leaveStart} onChange={(event) => setLeaveStart(event.target.value)} style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }} />
            <input required type="date" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }} />
            <input value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} placeholder="Reason (optional)" style={{ padding: 11, border: '1px solid #d9e2ec', borderRadius: 9 }} />
            <button type="submit" disabled={busy === 'leave'} style={{ gridColumn: '1 / -1', padding: '11px 14px', border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, fontWeight: 800 }}>{busy === 'leave' ? 'Submitting…' : 'Request leave'}</button>
          </form>
          <div style={{ marginTop: 18 }}>{leaveRequests.length === 0 ? <p style={{ color: '#627d98' }}>No leave requests yet.</p> : leaveRequests.map((leave) => <div key={leave.id} style={{ padding: 10, borderTop: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><strong>{leave.leave_type}</strong><div style={{ fontSize: 13 }}>{dateLabel(leave.start_date)} – {dateLabel(leave.end_date)}</div></div><span style={{ fontSize: 12, fontWeight: 800 }}>{leave.status}</span></div>)}</div>
        </section>

        <section style={{ ...card, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ marginTop: 0 }}>Request History</h2><span style={{ fontSize: 12, color: '#627d98' }}>{requests.length} rota requests</span></div>
          {requests.length === 0 ? <p style={{ color: '#627d98' }}>No requests.</p> : requests.map((request) => <div key={request.id} style={{ padding: '11px 0', borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', gap: 15 }}><div><strong>{request.request_type}</strong><div style={{ fontSize: 12, color: '#627d98' }}>{request.shift?.shift_date ? dateLabel(request.shift.shift_date) : 'Shift'}{request.requested_shift ? ` → ${dateLabel(request.requested_shift.shift_date)}` : ''} · {request.created_at ? new Date(request.created_at).toLocaleString('en-IE') : ''}</div></div><span style={{ fontWeight: 800, fontSize: 12 }}>{request.status}</span></div>)}
        </section>
      </div>
    </main>
  );
}
