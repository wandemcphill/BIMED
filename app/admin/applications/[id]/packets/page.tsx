'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';

type Definition = { title: string; description: string; internationalOnly?: boolean; candidateVisible?: boolean; mode?: string; onboardingEmail?: boolean };
type Access = { id: string; packet_slug: string; created_by: string; issued_at: string; expires_at: string; viewed_at: string | null; revoked_at: string | null; created_at: string; last_saved_at: string | null; completed_at: string | null };
type Payload = { application: { id: string; full_name: string; international: boolean }; required: string[]; packets: Access[]; packetDefinitions: Record<string, Definition> };

function date(value: string) { return new Date(value).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' }); }

export default function CandidatePacketsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [issueSlug, setIssueSlug] = useState('');
  const [issuedUrl, setIssuedUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/admin/applications/${id}/document-packets`);
    if (response.status === 401) { setError('Admin session required.'); return; }
    const next = await response.json();
    if (!response.ok) { setError(next.error || 'Unable to load packet history.'); return; }
    setPayload(next);
    if (!issueSlug && next.required?.[0]) setIssueSlug(next.required[0]);
  };
  useEffect(() => { void load(); }, [id]);

  const definitions = useMemo(() => Object.entries(payload?.packetDefinitions || {}), [payload]);

  const issue = async () => {
    setBusy(true); setError(''); setIssuedUrl('');
    const response = await fetch(`/api/admin/applications/${id}/document-packets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packet_slug: issueSlug }) });
    const next = await response.json();
    setBusy(false);
    if (!response.ok) { setError(next.error || 'Unable to issue packet.'); return; }
    setIssuedUrl(next.url);
    await load();
  };

  const revoke = async (accessId: string) => {
    if (!window.confirm('Revoke this private candidate document link?')) return;
    const response = await fetch(`/api/admin/applications/${id}/document-packets`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_id: accessId }) });
    const next = await response.json();
    if (!response.ok) { setError(next.error || 'Unable to revoke packet link.'); return; }
    await load();
  };

  if (!payload) return <><Header /><main className="wrap"><section className="card"><h1>Candidate documents</h1><p className="muted">Loading secure document history...</p>{error && <div className="error">{error}</div>}</section></main></>;

  const requiredSet = new Set(payload.required);
  const latest = new Map<string, Access>();
  for (const entry of payload.packets) if (!latest.has(entry.packet_slug)) latest.set(entry.packet_slug, entry);
  const candidateDefinitions = definitions.filter(([, def]) => def.candidateVisible !== false && (!def.internationalOnly || payload.application.international));

  return (
    <><Header /><main className="wrap"><section className="card">
      <div className="section-heading"><div><span className="pill">CANDIDATE DOCUMENTS</span><h1>{payload.application.full_name}</h1><p className="muted">{payload.application.international ? 'International pathway' : 'Ireland-based pathway'} · secure, expiring candidate links</p></div><a className="secondary link-button" href={`/admin/applications/${id}`}>Back to candidate</a></div>
      <section className="subcard"><h2>Issue a candidate document</h2><p className="muted">Generate one secure, expiring candidate link. Internal HR and manager checklists are not issued through this area.</p><div className="grid"><label><span>Document</span><select value={issueSlug} onChange={e => setIssueSlug(e.target.value)}>{candidateDefinitions.map(([slug, def]) => <option key={slug} value={slug}>{def.title}{requiredSet.has(slug) ? '' : ' (optional)'}</option>)}</select></label></div><button className="primary" onClick={() => void issue()} disabled={busy || !issueSlug}>{busy ? 'Issuing...' : 'Generate private link'}</button>{issuedUrl && <div className="success" style={{ marginTop: 12 }}><strong>Private link generated.</strong><div style={{ marginTop: 8, wordBreak: 'break-all' }}>{issuedUrl}</div></div>}{error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}</section>
      <section className="subcard"><h2>Candidate document status</h2><div className="activity-list">{payload.required.map(slug => { const entry = latest.get(slug); const def = payload.packetDefinitions[slug]; const active = entry && !entry.revoked_at && new Date(entry.expires_at).getTime() > Date.now(); const completion = entry?.completed_at ? `Submitted ${date(entry.completed_at)}` : entry?.last_saved_at ? `Saved ${date(entry.last_saved_at)}` : 'No response yet'; return <article className="activity-item" key={slug}><div className="activity-heading"><strong>{def?.title || slug}</strong><span>{entry?.completed_at ? 'Submitted' : active ? 'Active' : entry ? entry.revoked_at ? 'Revoked' : 'Expired' : 'Not issued'}</span></div><p className="muted">{def?.description || ''}</p>{entry && <p className="muted">Issued {date(entry.issued_at)} · expires {date(entry.expires_at)} · {entry.viewed_at ? `first viewed ${date(entry.viewed_at)}` : 'not viewed yet'} · {completion}</p>}{entry?.revoked_at && <p className="muted">Revoked {date(entry.revoked_at)}.</p>}{active && !entry?.completed_at && <button className="secondary danger" onClick={() => void revoke(entry.id)}>Revoke link</button>}</article>; })}</div></section>
      <section className="subcard"><h2>Document history</h2>{payload.packets.length ? <div className="activity-list">{payload.packets.map(entry => <article className="activity-item" key={entry.id}><div className="activity-heading"><strong>{payload.packetDefinitions[entry.packet_slug]?.title || entry.packet_slug}</strong><span>{entry.completed_at ? 'Submitted' : entry.revoked_at ? 'Revoked' : new Date(entry.expires_at).getTime() > Date.now() ? 'Active' : 'Expired'}</span></div><p className="muted">Issued by {entry.created_by} · {date(entry.issued_at)} · expires {date(entry.expires_at)}{entry.last_saved_at ? ` · last saved ${date(entry.last_saved_at)}` : ''}</p></article>)}</div> : <p className="muted">No candidate document links have been issued.</p>}</section>
    </section></main></>
  );
}
