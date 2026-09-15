'use client';

import { useEffect, useState } from 'react';
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
  unavailable?: boolean;
  application?: { role_applied: string | null };
  items: Item[];
};

const POST_ACCESS_KEYS = new Set([
  'references_verified',
  'right_to_work_verified',
  'international_work_permission_verified',
]);

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5eaf0',
  borderRadius: 16,
  padding: 20,
};

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

function statusPill(status: Item['status']) {
  const label = status === 'waived' ? 'Waived' : status === 'completed' ? 'Complete' : 'Pending';
  const palette = status === 'pending'
    ? { background: '#fff8e1', color: '#975a16' }
    : status === 'completed'
      ? { background: '#e6fffb', color: '#0f766e' }
      : { background: '#edf2f7', color: '#334e68' };
  return <span style={{ ...palette, flexShrink: 0, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 900 }}>{label}</span>;
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
        if (!response.ok) throw new Error(body.error || 'Unable to load verification record.');
        setPayload(body);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load verification record.');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  if (loading) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><div style={card}>Loading your BIMED verification record…</div></div></main>;
  if (error || !payload) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button><div role="alert" style={{ ...card, marginTop: 18, color: '#9b2c2c' }}>{error || 'Verification record unavailable.'}</div></div></main>;

  const checks = payload.items.filter((item) => POST_ACCESS_KEYS.has(item.item_key));
  const role = payload.application?.role_applied || 'BIMED staff';

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '28px 20px 70px', fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button>
      <header style={{ ...card, marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED HEALTHCARE · VERIFICATION</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 6 }}>
          <div style={{ maxWidth: 700 }}>
            <h1 style={{ margin: 0 }}>Post-access verification</h1>
            <p style={{ color: '#627d98', marginBottom: 0 }}>{role} · Identity and qualification evidence were reviewed before your BIMED staff portal access was issued. The checks below are managed by BIMED and may remain pending until the applicable employment or regulatory step is cleared.</p>
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 999, background: '#e6fffb', color: '#0f766e', fontSize: 12, fontWeight: 900 }}>Portal access approved</div>
        </div>
      </header>

      {!!checks.length && <section style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        {checks.map((item) => <article key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: '#0f766e', letterSpacing: 1 }}>{item.required ? 'REQUIRED CHECK' : 'OPTIONAL CHECK'}</div><h2 style={{ margin: '5px 0 6px', fontSize: 20 }}>{item.title}</h2><p style={{ margin: 0, color: '#627d98' }}>{item.description}</p></div>
            {statusPill(item.status)}
          </div>
          {item.status !== 'pending' && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #edf2f7', fontSize: 13, color: '#486581' }}>Recorded {fmt(item.completed_at)}{item.completed_by ? ` by ${item.completed_by}` : ''}{item.notes ? ` · ${item.notes}` : ''}</div>}
        </article>)}
      </section>}

      {!checks.length && <section style={{ ...card, marginTop: 18, color: '#627d98' }}>No post-access verification checks are currently assigned to this staff identity.</section>}
      {payload.unavailable && <section style={{ ...card, marginTop: 18, color: '#627d98' }}>Your staff identity is not currently linked to a recruitment verification record. Contact BIMED HR if you believe this is incorrect.</section>}

      <section style={{ ...card, marginTop: 18, color: '#627d98' }}>
        <strong style={{ color: '#102a43' }}>Need a correction?</strong>
        <p style={{ marginBottom: 0 }}>This employee view cannot change verification outcomes. Ask the BIMED recruitment, immigration or HR team to review a check so the controlled audit trail is preserved.</p>
      </section>
    </div>
  </main>;
}
