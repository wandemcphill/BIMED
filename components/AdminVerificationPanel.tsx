'use client';

import { useEffect, useState } from 'react';

type VerificationItem = {
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

type Props = {
  applicationId: string;
};

const POST_ACCESS_KEYS = new Set([
  'references_verified',
  'right_to_work_verified',
  'international_work_permission_verified',
]);

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

export default function AdminVerificationPanel({ applicationId }: Props) {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load(attempt = 0): Promise<void> {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/admin/applications/${applicationId}/onboarding-checklist`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && attempt < 12) {
      window.setTimeout(() => void load(attempt + 1), 1000);
      return;
    }
    if (!response.ok) {
      setError(data.error || 'Unable to load verification controls.');
      setLoading(false);
      return;
    }
    setItems((data.items || []).filter((item: VerificationItem) => POST_ACCESS_KEYS.has(item.item_key)));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [applicationId]);

  async function save(item: VerificationItem, status: VerificationItem['status'], notes: string) {
    setSavingKey(item.item_key);
    setMessage('');
    setError('');
    const response = await fetch(`/api/admin/applications/${applicationId}/onboarding-checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: item.item_key, status, notes }),
    });
    const data = await response.json().catch(() => ({}));
    setSavingKey('');
    if (!response.ok) {
      setError(data.error || 'Unable to update verification check.');
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? data.item : entry));
    setMessage(`${item.title} updated to ${status}.`);
  }

  if (loading) {
    return <section className="subcard"><h2>Post-access verification</h2><p className="muted">Loading verification controls...</p></section>;
  }

  return (
    <section className="subcard">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>Post-access verification</h2>
          <p className="muted" style={{ marginTop: 0 }}>These checks can remain pending after staff portal access is issued. Recruitment, immigration or HR can update each one as evidence is cleared.</p>
        </div>
        <span className="pill">ADMIN CONTROLLED</span>
      </div>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="success" style={{ marginTop: 12 }}>{message}</div>}

      {!items.length && <p className="muted">No post-access verification checks are assigned to this candidate.</p>}

      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {items.map((item) => (
          <VerificationRow key={item.id} item={item} busy={savingKey === item.item_key} onSave={save} />
        ))}
      </div>
    </section>
  );
}

function VerificationRow({
  item,
  busy,
  onSave,
}: {
  item: VerificationItem;
  busy: boolean;
  onSave: (item: VerificationItem, status: VerificationItem['status'], notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<VerificationItem['status']>(item.status);
  const [notes, setNotes] = useState(item.notes || '');

  useEffect(() => {
    setStatus(item.status);
    setNotes(item.notes || '');
  }, [item.status, item.notes]);

  return (
    <article style={{ border: '1px solid #e5eaf0', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#0f766e' }}>REQUIRED CHECK</div>
          <h3 style={{ margin: '5px 0 6px' }}>{item.title}</h3>
          <p className="muted" style={{ margin: 0 }}>{item.description}</p>
        </div>
        <span className="pill">{item.status}</span>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value as VerificationItem['status'])}>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div className="field">
          <label>Admin note</label>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional verification note" />
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => void onSave(item, status, notes)} disabled={busy}>
          {busy ? 'Saving...' : 'Save verification'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {item.status === 'pending' ? 'Currently pending' : `${item.status} · ${formatDate(item.completed_at)}${item.completed_by ? ` · ${item.completed_by}` : ''}`}
        </span>
      </div>
    </article>
  );
}
