'use client';

import { FormEvent, useEffect, useState } from 'react';

type Row = Record<string, any>;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const input: React.CSSProperties = { width: '100%', padding: 10, border: '1px solid #d9e2ec', borderRadius: 9, boxSizing: 'border-box' };

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminRotaPage() {
  const [shifts, setShifts] = useState<Row[]>([]);
  const [staff, setStaff] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<Row[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('Early');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:00');
  const [role, setRole] = useState('Support Worker');
  const [location, setLocation] = useState('BIMED Healthcare');
  const [staffId, setStaffId] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    const [rotaResponse, staffResponse] = await Promise.all([
      fetch(`/api/admin/rota?from=${date}&to=${date}`),
      fetch('/api/admin/staff?status=active'),
    ]);
    const rota = await rotaResponse.json();
    const staffData = await staffResponse.json();
    if (rotaResponse.status === 401 || staffResponse.status === 401) { setError('Admin session required.'); return; }
    if (!rotaResponse.ok) { setError(rota.error || 'Unable to load rota.'); return; }
    setShifts(rota.shifts || []);
    setRequests(rota.pendingRequests || []);
    setLeaveRequests(rota.pendingLeaveRequests || []);
    if (staffResponse.ok) setStaff(staffData.staff || []);
  }

  useEffect(() => { void load(); }, [date]);

  async function submit(action: Row, successMessage?: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/rota', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed.');
      await load();
      if (successMessage) console.info(successMessage);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Action failed.');
    } finally { setBusy(false); }
  }

  function createShift(event: FormEvent) {
    event.preventDefault();
    const start = new Date(`${date}T${startTime}:00`).toISOString();
    let endDate = date;
    if (endTime <= startTime) {
      const next = new Date(`${date}T${endTime}:00`); next.setDate(next.getDate() + 1); endDate = next.toISOString().slice(0, 10);
    }
    const end = new Date(`${endDate}T${endTime}:00`).toISOString();
    void submit({ action: 'create', shiftDate: date, startAt: start, endAt: end, shiftType, role, location, breakMinutes: Number(breakMinutes || 0), notes, staffId: staffId || null });
  }

  async function respond(requestId: string, decision: 'approve' | 'decline') {
    await submit({ action: 'request_response', requestId, decision });
  }

  async function respondLeave(requestId: string, decision: 'approve' | 'decline') {
    await submit({ action: 'leave_response', requestId, decision });
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 5vw', background: '#f7f9fc', fontFamily: 'system-ui', color: '#102a43' }}>
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>Workforce Rota Manager</h1><p style={{ margin: 0, color: '#627d98' }}>Create, assign, approve and monitor the permanent BIMED staff rota.</p></header>
        {error && <div style={{ background: '#fff5f5', color: '#9b2c2c', border: '1px solid #fed7d7', padding: 12, borderRadius: 10, marginBottom: 16 }}>{error}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(340px, .8fr)', gap: 18, marginBottom: 18 }}>
          <form onSubmit={createShift} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}><div><h2 style={{ margin: 0 }}>Create shift</h2><div style={{ fontSize: 12, color: '#627d98' }}>Times are scheduled for the BIMED operating rota.</div></div><input type='date' value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, width: 160 }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Shift type<select value={shiftType} onChange={(e) => setShiftType(e.target.value)} style={{ ...input, marginTop: 5 }}><option>Early</option><option>Late</option><option>Night</option><option>Long Day</option><option>Weekend</option><option>Bank Holiday</option><option>Training</option></select></label>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Start<input required type='time' value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Finish<input required type='time' value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Role<input value={role} onChange={(e) => setRole(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Location<input value={location} onChange={(e) => setLocation(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Break minutes<input type='number' min='0' value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} style={{ ...input, marginTop: 5 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 800, gridColumn: '1 / -1' }}>Assign now (optional)<select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...input, marginTop: 5 }}><option value=''>Leave open for staff requests</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.bimed_id} · {person.preferred_name || person.full_name} · {person.role || 'Staff'}</option>)}</select></label>
              <label style={{ fontSize: 13, fontWeight: 800, gridColumn: '1 / -1' }}>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...input, marginTop: 5, resize: 'vertical' }} /></label>
            </div>
            <button disabled={busy} type='submit' style={{ marginTop: 14, padding: '11px 16px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 800 }}>{busy ? 'Saving…' : staffId ? 'Create & assign shift' : 'Create open shift'}</button>
          </form>

          <div style={card}><h2 style={{ marginTop: 0 }}>Rota at a glance</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}><div style={{ padding: 14, background: '#f4f7fb', borderRadius: 12 }}><div style={{ fontSize: 12, color: '#627d98' }}>Total shifts</div><div style={{ fontSize: 28, fontWeight: 900 }}>{shifts.length}</div></div><div style={{ padding: 14, background: '#f4f7fb', borderRadius: 12 }}><div style={{ fontSize: 12, color: '#627d98' }}>Open shifts</div><div style={{ fontSize: 28, fontWeight: 900 }}>{shifts.filter((s) => s.status === 'available').length}</div></div><div style={{ padding: 14, background: '#f4f7fb', borderRadius: 12 }}><div style={{ fontSize: 12, color: '#627d98' }}>Shift requests</div><div style={{ fontSize: 28, fontWeight: 900 }}>{requests.filter((r) => r.request_type === 'shift').length}</div></div><div style={{ padding: 14, background: '#f4f7fb', borderRadius: 12 }}><div style={{ fontSize: 12, color: '#627d98' }}>Leave requests</div><div style={{ fontSize: 28, fontWeight: 900 }}>{leaveRequests.length}</div></div></div></div>
        </section>

        <section style={{ ...card, marginBottom: 18 }}><h2 style={{ marginTop: 0 }}>Shifts for {date}</h2>{shifts.length === 0 ? <p style={{ color: '#627d98' }}>No shifts have been created for this date.</p> : <div style={{ display: 'grid', gap: 9 }}>{shifts.map((shift) => <div key={shift.id} style={{ padding: 13, border: '1px solid #e5eaf0', borderRadius: 12, display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 12, alignItems: 'center' }}><div><strong>{shift.shift_type}</strong><div style={{ fontSize: 13 }}>{formatTime(shift.start_at)}–{formatTime(shift.end_at)}</div></div><div style={{ fontSize: 13 }}>{shift.role || 'Role not set'}<div style={{ color: '#627d98', fontSize: 12 }}>{shift.location || 'BIMED'}</div></div><div style={{ fontSize: 13, fontWeight: 800 }}>{shift.staff?.bimed_id || 'OPEN SHIFT'}<div style={{ color: '#627d98', fontWeight: 400, fontSize: 12 }}>{shift.staff?.full_name || 'Available to eligible staff'}</div></div><span style={{ fontSize: 12, fontWeight: 800 }}>{shift.status}</span></div>)}</div>}</section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
          <div style={card}><h2 style={{ marginTop: 0 }}>Pending rota requests</h2>{requests.length === 0 ? <p style={{ color: '#627d98' }}>No pending rota requests.</p> : requests.map((request) => <div key={request.id} style={{ padding: 12, borderBottom: '1px solid #edf2f7' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{request.staff?.bimed_id} · {request.staff?.full_name}</strong><span style={{ fontSize: 12, fontWeight: 800 }}>{request.request_type}</span></div><div style={{ fontSize: 13, marginTop: 4 }}>{request.shift?.shift_date} · {request.shift?.shift_type} · {request.shift ? `${formatTime(request.shift.start_at)}–${formatTime(request.shift.end_at)}` : ''}</div>{request.requested_shift && <div style={{ fontSize: 13, color: '#627d98' }}>Swap target: {request.requested_shift.shift_date} · {request.requested_shift.shift_type} · {formatTime(request.requested_shift.start_at)}–{formatTime(request.requested_shift.end_at)}</div>}<div style={{ display: 'flex', gap: 8, marginTop: 9 }}><button disabled={busy} onClick={() => void respond(request.id, 'approve')} style={{ padding: '7px 10px', border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', fontWeight: 800 }}>Approve</button><button disabled={busy} onClick={() => void respond(request.id, 'decline')} style={{ padding: '7px 10px', border: '1px solid #d9e2ec', borderRadius: 8, background: '#fff' }}>Decline</button></div></div>)}</div>
          <div style={card}><h2 style={{ marginTop: 0 }}>Pending leave</h2>{leaveRequests.length === 0 ? <p style={{ color: '#627d98' }}>No pending leave requests.</p> : leaveRequests.map((leave) => <div key={leave.id} style={{ padding: 12, borderBottom: '1px solid #edf2f7' }}><strong>{leave.staff?.bimed_id} · {leave.staff?.full_name}</strong><div style={{ fontSize: 13 }}>{leave.leave_type} · {leave.start_date} → {leave.end_date}</div>{leave.reason && <div style={{ fontSize: 12, color: '#627d98', marginTop: 4 }}>{leave.reason}</div>}<div style={{ display: 'flex', gap: 8, marginTop: 9 }}><button disabled={busy} onClick={() => void respondLeave(leave.id, 'approve')} style={{ padding: '7px 10px', border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', fontWeight: 800 }}>Approve</button><button disabled={busy} onClick={() => void respondLeave(leave.id, 'decline')} style={{ padding: '7px 10px', border: '1px solid #d9e2ec', borderRadius: 8, background: '#fff' }}>Decline</button></div></div>)}</div>
        </section>
      </div>
    </main>
  );
}
