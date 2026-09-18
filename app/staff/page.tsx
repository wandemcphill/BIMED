'use client';

import { FormEvent, useEffect, useMemo, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type Staff = Record<string, any>;
type Shift = Record<string, any>;
type Payslip = Record<string, any>;
type Notice = Record<string, any>;
type Tab = 'overview' | 'rota' | 'pay' | 'profile' | 'notifications';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 18, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };

function formatTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return date.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }); }
function initials(name: string) { return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }

export default function StaffDashboard() {
  const router = useRouter(); const [staff, setStaff] = useState<Staff | null>(null); const [shifts, setShifts] = useState<Shift[]>([]); const [requests, setRequests] = useState<any[]>([]); const [payslips, setPayslips] = useState<Payslip[]>([]); const [notifications, setNotifications] = useState<Notice[]>([]); const [onboarding, setOnboarding] = useState<any>(null); const [permitSummary, setPermitSummary] = useState<any>(null); const [tab, setTab] = useState<Tab>('overview'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [photoBusy, setPhotoBusy] = useState(false); const [photoFailed, setPhotoFailed] = useState(false); const [pps, setPps] = useState(''); const [address, setAddress] = useState(''); const [phone, setPhone] = useState('');

  async function load() {
    setError('');
    const [meResponse, rotaResponse, payResponse, noticeResponse] = await Promise.all([
      fetch('/api/staff/me'),
      fetch('/api/staff/rota'),
      fetch('/api/staff/payslips'),
      fetch('/api/staff/notifications'),
    ]);
    if (meResponse.status === 401) { router.replace('/staff/login'); return; }
    const [me, rota, pay, notice] = await Promise.all([meResponse.json(), rotaResponse.json(), payResponse.json(), noticeResponse.json()]);
    if (!meResponse.ok) { setError(me.error || 'Unable to load your BIMED profile.'); return; }
    setStaff(me.staff); setPhotoFailed(false); setPps(me.staff.pps_number || ''); setAddress(me.staff.address_line_1 || ''); setPhone(me.staff.phone || ''); setShifts(rota.shifts || []); setRequests(rota.requests || []); setPayslips(pay.payslips || []); setNotifications(notice.notifications || []);

    if (me.staff.application_id) {
      const [onboardingResponse, permitResponse] = await Promise.all([
        fetch('/api/staff/onboarding', { cache: 'no-store' }),
        me.staff.status === 'pre_arrival' ? fetch('/api/staff/permit', { cache: 'no-store' }) : Promise.resolve(null),
      ]);
      const onboardingData = await onboardingResponse.json().catch(() => null);
      setOnboarding(onboardingResponse.ok ? onboardingData : null);
      if (permitResponse) {
        const permitData = await permitResponse.json().catch(() => null);
        setPermitSummary(permitResponse.ok ? permitData : null);
      } else {
        setPermitSummary(null);
      }
    } else {
      setOnboarding(null); setPermitSummary(null);
    }
  }
  useEffect(() => { void load(); }, []);
  const unreadCount = useMemo(() => notifications.filter((notice) => !notice.read_at).length, [notifications]);

  async function saveProfile(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const response = await fetch('/api/staff/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pps_number: pps, address_line_1: address, phone }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to save profile.'); setStaff(data.staff); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save profile.'); } finally { setBusy(false); } }
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setPhotoBusy(true); setPhotoFailed(false); setError(''); try { const formData = new FormData(); formData.append('photo', file); const response = await fetch('/api/staff/me', { method: 'POST', body: formData }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Unable to upload photograph (${response.status}).`); setStaff(data.staff); } catch (photoError) { setError(photoError instanceof Error ? photoError.message : 'Unable to upload photograph.'); } finally { setPhotoBusy(false); event.target.value = ''; } }
  async function markAllRead() { const response = await fetch('/api/staff/notifications', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) }); if (response.ok) setNotifications((items) => items.map((item) => ({ ...item, read_at: new Date().toISOString() }))); }
  async function logout() { await fetch('/api/staff/auth/logout', { method: 'POST' }); router.replace('/staff/login'); }

  if (!staff) return <main style={{ padding: 40, fontFamily: 'system-ui' }}>{error || 'Loading BIMED Staff Portal…'}</main>;
  const name = staff.preferred_name || staff.full_name;
  const isIntake = Boolean(staff.application_id);
  const sourceLabel = isIntake ? 'Recruitment intake' : 'Internal BIMED staff';
  const onboardingProgress = Number(onboarding?.progress || 0);
  const permitReady = Boolean(permitSummary?.accommodationReady);
  const permitAcknowledged = Boolean(permitSummary?.permit?.accommodation_terms_acknowledged_at);
  const permitCancellationPending = Boolean(permitSummary?.permit?.cancellation_requested_at && !permitSummary?.permit?.cancellation_finalized_at);
  const permitComplete = permitReady || ['approved', 'approved_by_authority'].includes(permitSummary?.permit?.permit_decision || '');
  const onboardingStageCount = isIntake ? 3 : 0;
  const onboardingStageComplete = isIntake ? [permitAcknowledged, onboardingProgress >= 100, permitComplete].filter(Boolean).length : 0;
  const overallProgress = isIntake ? Math.round((onboardingStageComplete / onboardingStageCount) * 100) : 100;
  const nextAction = isIntake
    ? permitCancellationPending
      ? { title: 'Cancellation pending', text: 'Review the 24-hour reversal window in Employment Permit & Sponsorship.', href: '/staff/permit', label: 'Review cancellation' }
      : !permitAcknowledged
        ? { title: 'Choose your accommodation arrangement', text: 'Select the accommodation plan and permit submission route in your sponsorship workspace.', href: '/staff/permit', label: 'Review accommodation' }
        : onboardingProgress < 100
          ? { title: 'BIMED verification is still in progress', text: 'Check your recruitment-linked onboarding items and their current status.', href: '/staff/onboarding', label: 'View onboarding' }
          : !permitComplete
            ? { title: 'Review permit and sponsorship progress', text: 'Your accommodation choice is recorded. Check the current permit and sponsorship status.', href: '/staff/permit', label: 'Open permit workspace' }
            : { title: 'Keep your relocation details ready', text: 'Review travel, arrival and first-month information before your move.', href: '/staff/relocation', label: 'Open relocation guide' }
    : { title: 'Your BIMED workspace is ready', text: 'Use the dashboard shortcuts to manage your rota, profile, messages and payslips.', href: '/staff/messages', label: 'Open messages' };

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5eaf0', padding: '16px 5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e', textTransform: 'uppercase' }}>BIMED Healthcare</div><div style={{ fontSize: 22, fontWeight: 800 }}>Staff Portal</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800 }}>{name}</div><div style={{ fontSize: 12, color: '#627d98' }}>{staff.bimed_id}</div></div><button onClick={logout} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Sign out</button></div>
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>{([['overview', 'Overview'], ['rota', 'My Rota'], ['pay', 'Payslips'], ['profile', 'My Profile'], ['notifications', `Notifications${unreadCount ? ` (${unreadCount})` : ''}`]] as Array<[Tab, string]>).map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 15px', borderRadius: 10, border: '1px solid #d9e2ec', background: tab === id ? '#0f766e' : '#fff', color: tab === id ? '#fff' : '#334e68', fontWeight: 800 }}>{label}</button>)}</nav>
        {error && <div style={{ ...card, borderColor: '#fed7d7', color: '#9b2c2c', marginBottom: 18 }}>{error}</div>}

        {tab === 'overview' && <>
          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, .8fr)', gap: 18 }}>
            <div style={card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}><div><div style={{ color: '#627d98', fontSize: 13 }}>Welcome back</div><h1 style={{ fontSize: 32, margin: '4px 0 10px' }}>{name}</h1><div style={{ display: 'inline-flex', padding: '5px 9px', borderRadius: 999, background: isIntake ? '#e6fffb' : '#f4f7fb', color: isIntake ? '#0f766e' : '#334e68', fontWeight: 900, fontSize: 12 }}>{sourceLabel}</div><p style={{ margin: '12px 0 0', color: '#627d98' }}>Permanent BIMED ID: <strong>{staff.bimed_id}</strong>. This account stays with you throughout your employment.</p></div><div style={{ width: 92, height: 92, borderRadius: '50%', overflow: 'hidden', background: '#e6fffb', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{staff.profile_photo_url && !photoFailed ? <img src={staff.profile_photo_url} alt="BIMED staff photograph" onError={() => setPhotoFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: 900, color: '#0f766e', fontSize: 28 }}>{initials(staff.full_name || '?')}</span>}</div></div></div>
            <div style={card}><div style={{ color: '#627d98', fontSize: 13 }}>Payroll readiness</div><div style={{ fontSize: 28, fontWeight: 900, margin: '4px 0 12px' }}>{staff.pps_number ? 'PPS added' : 'PPS pending'}</div><div style={{ fontSize: 12, color: '#627d98' }}>{staff.pps_number ? 'Your PPS number is on your BIMED profile.' : 'Add your PPS number yourself when you receive it in Ireland.'}</div></div>
          </section>

          <section style={{ ...card, marginTop: 18, background: 'linear-gradient(135deg,#ffffff 0%,#f7fcfc 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#0f766e', fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>YOUR NEXT ACTION</div>
                <h2 style={{ margin: '4px 0 6px' }}>{nextAction.title}</h2>
                <p style={{ margin: 0, color: '#627d98', lineHeight: 1.55, maxWidth: 760 }}>{nextAction.text}</p>
                <a href={nextAction.href} style={{ display: 'inline-flex', marginTop: 14, padding: '10px 14px', borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>{nextAction.label} →</a>
              </div>
              <div style={{ minWidth: 150, textAlign: 'right' }}>
                <div style={{ color: '#627d98', fontSize: 12 }}>Onboarding progress</div>
                <div style={{ fontSize: 38, lineHeight: 1, fontWeight: 950, marginTop: 6, color: '#102a43' }}>{overallProgress}%</div>
              </div>
            </div>
            <div style={{ marginTop: 18, height: 10, background: '#e6eef1', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${overallProgress}%`, height: '100%', background: 'linear-gradient(90deg,#0f766e,#1aa69d)', borderRadius: 999, transition: 'width .25s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 16 }}>
              {[
                ['Employment permit', permitComplete ? 'Progress recorded' : permitAcknowledged ? 'Arrangement selected' : 'Action required', '/staff/permit'],
                ['Onboarding checks', onboardingProgress >= 100 ? 'Complete' : `${onboardingProgress}% complete`, '/staff/onboarding'],
                ['Relocation', 'Guide available', '/staff/relocation'],
                ['Messages', `${unreadCount} unread`, '/staff/messages'],
              ].map(([title, text, href]) => (
                <a key={href} href={href} style={{ padding: 14, border: '1px solid #dce8ea', borderRadius: 14, background: '#fff', textDecoration: 'none', color: '#102a43', display: 'block', minHeight: 112 }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
                  <div style={{ marginTop: 7, fontSize: 12, color: '#627d98', lineHeight: 1.5 }}>{text}</div>
                  <div style={{ marginTop: 12, color: '#0f766e', fontSize: 12, fontWeight: 900 }}>Open →</div>
                </a>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 18 }}><h2 style={{ margin: '0 0 10px' }}>Your BIMED tools</h2><p style={{ margin: '0 0 14px', color: '#627d98' }}>Your account has the same core workforce access. Recruitment-linked staff also have their onboarding workspace.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            <ToolCard title="Messages" text="Contact BIMED Admin / HR and read replies." href="/staff/messages" />
            <ToolCard title="Rota" text="View assigned shifts and request available work." href="/staff/rota" />
            <ToolCard title="Attendance" text="Record and review your attendance information." href="/staff/attendance" />
            <ToolCard title="Payslips" text="View issued payslips and payroll records." onClick={() => setTab('pay')} />
            {isIntake ? <ToolCard title="Employment contract" text="Open your signed BIMED employment contract and print/save a copy." href="/staff/documents/contract" /> : null}
            <ToolCard title="My profile" text="Maintain your contact details and photograph." onClick={() => setTab('profile')} />
            {isIntake ? <ToolCard title="Onboarding" text="View the BIMED verification record and current recruitment-linked readiness." href="/staff/onboarding" /> : <ToolCard title="Work profile" text="Your internal BIMED employment details and workplace identity are managed here." onClick={() => setTab('profile')} />}
          </div></section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, marginTop: 18 }}><div style={card}><div style={{ fontSize: 13, color: '#627d98' }}>Upcoming shifts</div><div style={{ fontSize: 30, fontWeight: 900 }}>{shifts.filter((shift) => shift.status !== 'cancelled').length}</div><button onClick={() => router.push('/staff/rota')} style={linkButton}>Open rota →</button></div><div style={card}><div style={{ fontSize: 13, color: '#627d98' }}>Payslips available</div><div style={{ fontSize: 30, fontWeight: 900 }}>{payslips.length}</div><button onClick={() => setTab('pay')} style={linkButton}>View payslips →</button></div><div style={card}><div style={{ fontSize: 13, color: '#627d98' }}>Unread notifications</div><div style={{ fontSize: 30, fontWeight: 900 }}>{unreadCount}</div><button onClick={() => setTab('notifications')} style={linkButton}>Open notifications →</button></div></section>
        </>}

        {tab === 'rota' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: '0 0 5px' }}>My Rota</h2><p style={{ margin: 0, color: '#627d98' }}>Manage your shifts and request available work.</p></div><button onClick={() => router.push('/staff/rota')} style={primaryButton}>Open shift workspace</button></div><div style={{ display: 'grid', gap: 10, marginTop: 18 }}>{shifts.length === 0 ? <p style={{ color: '#627d98' }}>No assigned shifts yet.</p> : shifts.map((shift) => <div key={shift.id} style={{ border: '1px solid #e5eaf0', borderRadius: 12, padding: 14 }}><strong>{shift.shift_type}</strong><div>{shift.shift_date} · {formatTime(shift.start_at)}–{formatTime(shift.end_at)}</div><div style={{ fontSize: 12, color: '#627d98' }}>{shift.location || 'BIMED'}{shift.role ? ` · ${shift.role}` : ''}</div></div>)}</div><h3 style={{ marginTop: 24 }}>Recent requests</h3>{requests.length === 0 ? <p style={{ color: '#627d98' }}>No shift requests yet.</p> : requests.slice(0, 6).map((request) => <div key={request.id} style={{ borderTop: '1px solid #edf2f7', padding: '10px 0' }}><strong>{request.request_type}</strong><div style={{ fontSize: 12, color: '#627d98' }}>{request.status}</div></div>)}</section>}

        {tab === 'pay' && <section style={card}><h2 style={{ marginTop: 0 }}>My Payslips</h2>{payslips.length === 0 ? <p style={{ color: '#627d98' }}>Your BIMED payslips will appear here when issued.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left', padding: 10 }}>Pay period</th><th style={{ textAlign: 'right', padding: 10 }}>Gross</th><th style={{ textAlign: 'right', padding: 10 }}>Deductions</th><th style={{ textAlign: 'right', padding: 10 }}>Net pay</th></tr></thead><tbody>{payslips.map((payslip) => { const deductions = Number(payslip.paye || 0) + Number(payslip.prsi || 0) + Number(payslip.usc || 0) + Number(payslip.other_deductions || 0); return <tr key={payslip.id} style={{ borderTop: '1px solid #edf2f7' }}><td style={{ padding: 10 }}>{payslip.pay_period_start} – {payslip.pay_period_end}</td><td style={{ textAlign: 'right', padding: 10 }}>€{Number(payslip.gross_pay || 0).toFixed(2)}</td><td style={{ textAlign: 'right', padding: 10 }}>€{deductions.toFixed(2)}</td><td style={{ textAlign: 'right', padding: 10, fontWeight: 900 }}>€{Number(payslip.net_pay || 0).toFixed(2)}</td></tr>; })}</tbody></table></div>}</section>}

        {tab === 'profile' && <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18 }}><form onSubmit={saveProfile} style={card}><h2 style={{ marginTop: 0 }}>My BIMED Profile</h2><div style={{ display: 'grid', gap: 14 }}><div><label style={labelStyle}>BIMED ID</label><div style={readOnly}>{staff.bimed_id}</div><div style={{ fontSize: 12, color: '#627d98', marginTop: 5 }}>Assigned automatically. Employees do not choose or edit this identifier.</div></div><div><label style={labelStyle}>PPS Number</label><input value={pps} onChange={(event) => setPps(event.target.value)} placeholder="Not available yet? Leave blank and add it later." style={inputStyle} /><div style={{ fontSize: 12, color: '#627d98', marginTop: 5 }}>You can leave this blank before arriving in Ireland and add it later.</div></div><div><label style={labelStyle}>Phone</label><input value={phone} onChange={(event) => setPhone(event.target.value)} style={inputStyle} /></div><div><label style={labelStyle}>Address</label><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Add your Ireland address when available" style={inputStyle} /></div><button disabled={busy} style={primaryButton}>{busy ? 'Saving…' : 'Save profile'}</button></div></form><div style={card}><h2 style={{ marginTop: 0 }}>Your BIMED Staff Photograph</h2><div style={{ width: 180, height: 220, borderRadius: 14, overflow: 'hidden', background: '#eef2f7', display: 'grid', placeItems: 'center', marginBottom: 14 }}>{staff.profile_photo_url && !photoFailed ? <img src={staff.profile_photo_url} alt="BIMED Staff Photograph" onError={() => setPhotoFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#829ab1', fontWeight: 700 }}>{photoFailed ? 'Photo unavailable. Choose a new photo below.' : 'No photo uploaded'}</span>}</div><label style={{ display: 'grid', gap: 8, fontWeight: 800, fontSize: 13 }}><span>{photoBusy ? 'Uploading photograph…' : 'Choose a photograph'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={photoBusy} /></label><p style={{ fontSize: 12, color: '#627d98' }}>JPG, PNG or WebP, maximum 5 MB. Your photograph is stored privately and is only available to your authenticated BIMED staff account.</p></div></section>}

        {tab === 'notifications' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><div><h2 style={{ margin: 0 }}>BIMED Notifications</h2><p style={{ margin: '5px 0 0', color: '#627d98' }}>Rota, payroll, training and staff communications.</p></div><button onClick={markAllRead} style={secondaryButton}>Mark all read</button></div><div style={{ marginTop: 16 }}>{notifications.length === 0 ? <p style={{ color: '#627d98' }}>No notifications yet.</p> : notifications.map((notice) => <div key={notice.id} style={{ padding: '13px 0', borderTop: '1px solid #edf2f7' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{notice.title}</strong><span style={{ fontSize: 12, color: notice.read_at ? '#829ab1' : '#0f766e' }}>{notice.read_at ? 'Read' : 'New'}</span></div><p style={{ margin: '5px 0', color: '#486581' }}>{notice.body}</p>{notice.action_url && <button onClick={() => router.push(notice.action_url)} style={linkButton}>Open →</button>}</div>)}</div></section>}
      </div>
    </main>
  );
}

function ToolCard({ title, text, href, onClick }: { title: string; text: string; href?: string; onClick?: () => void }) { const action = href ? { onClick: () => { window.location.href = href; } } : { onClick }; return <div style={{ ...card, padding: 16, minHeight: 145 }}><div style={{ fontWeight: 900, fontSize: 17 }}>{title}</div><p style={{ color: '#627d98', fontSize: 13, minHeight: 42 }}>{text}</p><button onClick={action.onClick} style={linkButton}>Open →</button></div>; }

const primaryButton: React.CSSProperties = { padding: '11px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 };
const secondaryButton: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 };
const linkButton: React.CSSProperties = { border: 0, background: 'none', color: '#0f766e', fontWeight: 900, padding: 0, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', padding: 12, boxSizing: 'border-box', border: '1px solid #d9e2ec', borderRadius: 10 };
const readOnly: React.CSSProperties = { padding: 12, borderRadius: 10, background: '#f4f7fb', fontWeight: 900 };
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 };
