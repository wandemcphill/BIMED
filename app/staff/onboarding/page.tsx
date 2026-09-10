'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = {
  id: string;
  item_key: string;
  title: string;
  description: string;
  required: boolean;
  status: 'pending' | 'completed' | 'waived';
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

type Payload = {
  ready: boolean;
  progress: number;
  unavailable?: boolean;
  application?: { role_applied: string | null };
  items: Item[];
  missing: Array<{ item_key: string; title: string }>;
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5eaf0',
  borderRadius: 16,
  padding: 20,
};

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

function pill(status: Item['status']) {
  const label = status === 'waived' ? 'Waived' : status === 'completed' ? 'Complete' : 'Pending';
  return <span style={{ padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800 }}>{label}</span>;
}

export default function BimedStaffOnboarding() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/staff/onboarding', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.status === 401) {
          router.replace('/staff/login');
          return;
        }
        if (!response.ok) throw new Error(body.error || 'Unable to load onboarding.');
        setPayload(body);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load onboarding.');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  const counts = useMemo(() => {
    const required = payload?.items.filter((item) => item.required) || [];
    return {
      required: required.length,
      done: required.filter((item) => item.status === 'completed' || item.status === 'waived').length,
      pendingAck: required.filter((item) => item.status === 'completed' && !item.completed_by).length,
    };
  }, [payload]);

  if (loading) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><div style={card}>Loading your BIMED onboarding workspace…</div></div></main>;
  if (error || !payload) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button><div role="alert" style={{ ...card, marginTop: 18, color: '#9b2c2c' }}>{error || 'Onboarding unavailable.'}</div></div></main>;

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '28px 20px 70px', fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button>
      <header style={{ ...card, marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED HEALTHCARE · ONBOARDING</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 6 }}>
          <div><h1 style={{ margin: 0 }}>Your onboarding checklist</h1><p style={{ color: '#627d98', marginBottom: 0 }}>{payload.application?.role_applied || 'BIMED staff'} · This page is read-only. Compliance statuses are managed by BIMED.</p></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 30, fontWeight: 900 }}>{payload.progress}%</div><div style={{ color: '#627d98', fontSize: 12 }}>{counts.done} of {counts.required} required complete</div></div>
        </div>
        <div style={{ height: 10, background: '#edf2f7', borderRadius: 99, overflow: 'hidden', marginTop: 18 }}><div style={{ height: '100%', width: `${payload.progress}%`, background: '#0f766e' }} /></div>
        <div style={{ marginTop: 12, fontWeight: 800, color: payload.ready ? '#0f766e' : '#9b2c2c' }}>{payload.ready ? 'Onboarding readiness requirements are complete.' : `${payload.missing.length} required item${payload.missing.length === 1 ? '' : 's'} still open.`}</div>
        {payload.unavailable && <p style={{ marginBottom: 0, color: '#627d98' }}>Your BIMED staff identity is not currently linked to a recruitment record with an onboarding checklist.</p>}
      </header>

      <section style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {payload.items.map((item) => <article key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: '#0f766e', letterSpacing: 1 }}>{item.required ? 'REQUIRED' : 'OPTIONAL'}</div><h2 style={{ margin: '5px 0 6px', fontSize: 18 }}>{item.title}</h2><p style={{ margin: 0, color: '#627d98' }}>{item.description}</p></div>
            {pill(item.status)}
          </div>
          {item.status !== 'pending' && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #edf2f7', fontSize: 13, color: '#486581' }}>Recorded {fmt(item.completed_at)}{item.completed_by ? ` by ${item.completed_by}` : ''}{item.notes ? ` · ${item.notes}` : ''}</div>}
        </article>)}
        {!payload.items.length && <div style={card}>No onboarding checklist has been issued for this staff identity yet.</div>}
      </section>

      <section style={{ ...card, marginTop: 18, color: '#627d98' }}>
        <strong style={{ color: '#102a43' }}>Need a correction?</strong><p style={{ marginBottom: 0 }}>This employee view cannot change compliance outcomes. Ask the BIMED recruitment or HR team to review an item so the audit trail remains controlled.</p>
      </section>
    </div>
  </main>;
}
