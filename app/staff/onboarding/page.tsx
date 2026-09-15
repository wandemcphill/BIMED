'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = {
  id: string;
  item_key: string;
  title: string;
  description: string;
  required: boolean;
};

type Payload = {
  unavailable?: boolean;
  application?: { role_applied: string | null };
  items: Item[];
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5eaf0',
  borderRadius: 16,
  padding: 20,
};

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

  if (loading) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><div style={card}>Loading your BIMED onboarding record…</div></div></main>;
  if (error || !payload) return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24, fontFamily: 'system-ui', color: '#102a43' }}><div style={{ maxWidth: 1000, margin: '0 auto' }}><button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button><div role="alert" style={{ ...card, marginTop: 18, color: '#9b2c2c' }}>{error || 'Onboarding record unavailable.'}</div></div></main>;

  const role = payload.application?.role_applied || 'BIMED staff';

  return <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: '28px 20px 70px', fontFamily: 'system-ui', color: '#102a43' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <button onClick={() => router.push('/staff')} style={{ border: 0, background: 'transparent', padding: 0, color: '#0f766e', fontWeight: 800 }}>← Staff Portal</button>

      <header style={{ ...card, marginTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED HEALTHCARE · ONBOARDING</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 6 }}>
          <div style={{ maxWidth: 700 }}>
            <h1 style={{ margin: 0 }}>Your onboarding record</h1>
            <p style={{ color: '#627d98', marginBottom: 0 }}>{role} · Recruitment and compliance checks are completed by BIMED before staff portal access is issued.</p>
          </div>
          <div style={{ padding: '9px 12px', borderRadius: 999, background: '#e6fffb', color: '#0f766e', fontSize: 12, fontWeight: 900 }}>Portal access approved</div>
        </div>
      </header>

      <section style={{ ...card, marginTop: 18, borderColor: '#c6f6d5', background: '#f0fff4' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: '#276749' }}>BIMED INTERNAL VERIFICATION</div>
        <h2 style={{ margin: '6px 0 8px', color: '#22543d' }}>Pre-employment checks are handled by BIMED.</h2>
        <p style={{ margin: 0, color: '#2f5f46' }}>The documents and compliance evidence required for your appointment are collected and reviewed by the recruitment team before your staff portal access is issued. This employee view is informational only and does not show internal pending states.</p>
      </section>

      {!payload.items.length && !payload.unavailable && <section style={{ ...card, marginTop: 18 }}><h2 style={{ marginTop: 0 }}>Verification record</h2><p style={{ marginBottom: 0, color: '#627d98' }}>Your BIMED verification record does not currently contain any display items.</p></section>}

      {!!payload.items.length && <section style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {payload.items.map((item) => <article key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: '#0f766e', letterSpacing: 1 }}>{item.required ? 'REQUIRED CHECK' : 'ADDITIONAL CHECK'}</div><h2 style={{ margin: '5px 0 6px', fontSize: 18 }}>{item.title}</h2><p style={{ margin: 0, color: '#627d98' }}>{item.description}</p></div>
            <span style={{ flexShrink: 0, padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800, color: '#243b53' }}>BIMED record</span>
          </div>
        </article>)}
      </section>}

      {payload.unavailable && <section style={{ ...card, marginTop: 18, color: '#627d98' }}>Your staff identity is not currently linked to a recruitment checklist. Contact BIMED HR if you believe this is incorrect.</section>}

      <section style={{ ...card, marginTop: 18, color: '#627d98' }}>
        <strong style={{ color: '#102a43' }}>Need a correction?</strong>
        <p style={{ marginBottom: 0 }}>This employee view cannot change recruitment or compliance records. Ask the BIMED recruitment or HR team to review any issue so the internal audit trail remains controlled.</p>
      </section>
    </div>
  </main>;
}
