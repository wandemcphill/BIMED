'use client';

import { FormEvent, useEffect, useState } from 'react';

type Staff = Record<string, any>;

const input: React.CSSProperties = { width: '100%', padding: 11, border: '1px solid #d9e2ec', borderRadius: 9, boxSizing: 'border-box' };
const card: React.CSSProperties = { background: '#fff', padding: 24, borderRadius: 18, border: '1px solid #e5eaf0' };

export default function AdminPayslipsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffId, setStaffId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [basicHours, setBasicHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [weekendHours, setWeekendHours] = useState('');
  const [nightHours, setNightHours] = useState('');
  const [basicAmount, setBasicAmount] = useState('');
  const [overtimeAmount, setOvertimeAmount] = useState('');
  const [weekendAmount, setWeekendAmount] = useState('');
  const [nightAmount, setNightAmount] = useState('');
  const [allowances, setAllowances] = useState('');
  const [gross, setGross] = useState('');
  const [paye, setPaye] = useState('');
  const [prsi, setPrsi] = useState('');
  const [usc, setUsc] = useState('');
  const [otherDeductions, setOtherDeductions] = useState('');
  const [net, setNet] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => { const response = await fetch('/api/admin/staff?status=active'); const data = await response.json(); if (response.ok) setStaff(data.staff || []); else setError(data.error || 'Unable to load staff.'); })(); }, []);

  async function issue(event: FormEvent) {
    event.preventDefault(); setMessage(''); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/admin/payslips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ staffId, payPeriodStart: start, payPeriodEnd: end, paymentDate: paymentDate || end, basicHours, overtimeHours, weekendHours, nightHours, basicAmount, overtimeAmount, weekendAmount, nightAmount, allowances, grossPay: gross, paye, prsi, usc, otherDeductions, netPay: net, notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to issue payslip.');
      setMessage(`Payslip issued for ${data.payslip?.id || 'the selected employee'}.`);
    } catch (issueError) { setError(issueError instanceof Error ? issueError.message : 'Unable to issue payslip.'); } finally { setBusy(false); }
  }

  const field = (label: string, value: string, setValue: (value: string) => void, required = false) => <label style={{ fontWeight: 800, fontSize: 13 }}>{label}<input required={required} value={value} onChange={(e) => setValue(e.target.value)} type='number' min='0' step='0.01' style={{ ...input, marginTop: 5 }} /></label>;

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 980, margin: '0 auto' }}><div style={{ ...card, marginBottom: 18 }}><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>Payslip Centre</h1><p style={{ margin: 0, color: '#627d98' }}>Issue a BIMED-branded employee payslip. Payroll calculations remain under BIMED's payroll process.</p></div>{error && <div style={{ background: '#fff5f5', color: '#9b2c2c', padding: 12, borderRadius: 10, marginBottom: 15 }}>{error}</div>}{message && <div style={{ background: '#ecfdf5', color: '#166534', padding: 12, borderRadius: 10, marginBottom: 15 }}>{message}</div>}<form onSubmit={issue} style={card}><h2 style={{ marginTop: 0 }}>Employee & pay period</h2><div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}><label style={{ fontWeight: 800, fontSize: 13 }}>Employee<select required value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...input, marginTop: 5 }}><option value=''>Select BIMED employee</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.bimed_id} · {person.preferred_name || person.full_name}</option>)}</select></label><label style={{ fontWeight: 800, fontSize: 13 }}>Period start<input required type='date' value={start} onChange={(e) => setStart(e.target.value)} style={{ ...input, marginTop: 5 }} /></label><label style={{ fontWeight: 800, fontSize: 13 }}>Period end<input required type='date' value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...input, marginTop: 5 }} /></label><label style={{ fontWeight: 800, fontSize: 13 }}>Payment date<input type='date' value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={{ ...input, marginTop: 5 }} /></label></div><h3>Earnings</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>{field('Basic hours', basicHours, setBasicHours)}{field('Overtime hours', overtimeHours, setOvertimeHours)}{field('Weekend hours', weekendHours, setWeekendHours)}{field('Night hours', nightHours, setNightHours)}{field('Basic amount (€)', basicAmount, setBasicAmount)}{field('Overtime amount (€)', overtimeAmount, setOvertimeAmount)}{field('Weekend amount (€)', weekendAmount, setWeekendAmount)}{field('Night amount (€)', nightAmount, setNightAmount)}{field('Allowances (€)', allowances, setAllowances)}{field('Gross pay (€)', gross, setGross, true)}</div><h3>Deductions & net pay</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12 }}>{field('PAYE (€)', paye, setPaye)}{field('PRSI (€)', prsi, setPrsi)}{field('USC (€)', usc, setUsc)}{field('Other deductions (€)', otherDeductions, setOtherDeductions)}{field('Net pay (€)', net, setNet, true)}</div><label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginTop: 14 }}>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...input, marginTop: 5, resize: 'vertical' }} /></label><button disabled={busy} style={{ marginTop: 16, padding: '12px 18px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Issuing…' : 'Issue BIMED payslip'}</button></form></div></main>;
}
