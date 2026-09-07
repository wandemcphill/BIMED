'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Notice = Record<string, any>;
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };

export default function StaffNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/staff/notifications');
    const data = await response.json();
    if (response.status === 401) { router.replace('/staff/login'); return; }
    if (!response.ok) { setError(data.error || 'Unable to load notifications.'); return; }
    setNotifications(data.notifications || []);
  }
  useEffect(() => { void load(); }, []);

  async function markRead(id?: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update notifications.');
      setNotifications(data.notifications || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update notifications.'); } finally { setBusy(false); }
  }

  return <main style={{ minHeight: '100vh', background: '#f5f7fb', padding: '32px 5vw', fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 920, margin: '0 auto' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 20 }}><div><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#0f766e' }}>BIMED Healthcare</div><h1 style={{ margin: '5px 0' }}>Notifications</h1><p style={{ margin: 0, color: '#627d98' }}>Rota, payroll, training, leave and BIMED staff updates.</p></div><div style={{ display: 'flex', gap: 8 }}><button disabled={busy} onClick={() => void markRead()} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Mark all read</button><button onClick={() => router.push('/staff')} style={{ padding: '9px 12px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 9 }}>Back</button></div></div>{error && <div style={{ background: '#fff5f5', color: '#9b2c2c', padding: 12, borderRadius: 10, marginBottom: 15 }}>{error}</div>}<section style={card}>{notifications.length === 0 ? <p style={{ color: '#627d98' }}>You're all caught up.</p> : notifications.map((notice) => <div key={notice.id} style={{ padding: 15, borderBottom: '1px solid #edf2f7', background: notice.read_at ? '#fff' : '#f8fffe', borderRadius: 10, marginBottom: 6 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{notice.title}</strong><div style={{ marginTop: 4, color: '#52606d', lineHeight: 1.5 }}>{notice.body}</div></div><span style={{ fontSize: 12, color: '#627d98' }}>{notice.category}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 9 }}><span style={{ fontSize: 12, color: '#829ab1' }}>{notice.created_at ? new Date(notice.created_at).toLocaleString('en-IE') : ''}</span>{!notice.read_at && <button onClick={() => void markRead(notice.id)} style={{ padding: '6px 9px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 8 }}>Mark read</button>}</div></div>)}</section></div></main>;
}
