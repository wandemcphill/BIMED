'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Row = { id: string; participants: any[]; latest: any; unread?: boolean };
type Message = { id: string; sender_staff_id: string | null; sender_admin_email: string | null; body: string; created_at: string };
type DirectoryStaff = { id: string; full_name: string; preferred_name?: string | null; bimed_id: string; role: string | null; status: string; department: string | null; application_id: string | null };

export default function AdminMessagesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [directory, setDirectory] = useState<DirectoryStaff[]>([]);
  const [recipient, setRecipient] = useState('');
  const [newDraft, setNewDraft] = useState('');
  const [sendingNew, setSendingNew] = useState(false);

  async function load() { const r = await fetch('/api/admin/messages', { cache: 'no-store' }); if (!r.ok) { setError('Unable to load message centre.'); return; } const d = await r.json(); setRows(d.conversations || []); setDirectory(d.staff || []); }
  async function open(id: string, preserveHistory = false) { setActive(id); setError(''); const r = await fetch(`/api/admin/messages/${id}`, { cache: 'no-store' }); if (!r.ok) { setError('Unable to open conversation.'); return; } const d = await r.json(); const incoming = d.messages || []; setMessages((current) => preserveHistory ? Array.from(new Map([...current, ...incoming].map((m: Message) => [m.id, m])).values()).sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : incoming); if (!preserveHistory) setOlderCursor(d.nextCursor || null); setRows((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item)); }
  async function loadOlder() { if (!active || !olderCursor || loadingOlder) return; setLoadingOlder(true); setError(''); try { const r = await fetch(`/api/admin/messages/${active}?before=${encodeURIComponent(olderCursor)}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Unable to load older messages.'); setMessages((current) => [...(d.messages || []), ...current.filter((item) => !(d.messages || []).some((older: Message) => older.id === item.id))]); setOlderCursor(d.nextCursor || null); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load older messages.'); } finally { setLoadingOlder(false); } }
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); if (active) void open(active, true); }, 10000); return () => window.clearInterval(timer); }, [active]);
  async function reply() { if (!active || !draft.trim()) return; const r = await fetch(`/api/admin/messages/${active}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: draft }) }); const d = await r.json(); if (!r.ok) { setError(d.error || 'Unable to send.'); return; } setMessages((m) => [...m, d.message]); setDraft(''); void load(); }
  async function startMessage(event: FormEvent) { event.preventDefault(); if (!recipient || !newDraft.trim()) return; setSendingNew(true); setError(''); try { const r = await fetch('/api/admin/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ staffId: recipient, message: newDraft }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Unable to start conversation.'); setNewDraft(''); setRecipient(''); await load(); await open(d.conversation.id); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start conversation.'); } finally { setSendingNew(false); } }
  const visible = rows.filter((r) => !search.trim() || r.participants.some((p: any) => `${p.full_name} ${p.bimed_id} ${p.address || ''}`.toLowerCase().includes(search.toLowerCase())));
  const groupedDirectory = useMemo(() => [...directory].sort((a,b) => Number(!!b.application_id) - Number(!!a.application_id) || a.full_name.localeCompare(b.full_name)), [directory]);
  const unreadCount = rows.filter((r) => r.unread).length;
  const activeRow = rows.find((r) => r.id === active);

  return (
    <main className="admin-messages-page">
      <style>{`
        .admin-messages-page { min-height:100vh; background:#f4f7fb; color:#102a43; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:clamp(12px,3vw,24px); box-sizing:border-box; }
        .admin-messages-shell { width:min(1300px,100%); margin:0 auto; }
        .admin-messages-header { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:18px; }
        .admin-messages-header p { margin:0; color:#627d98; max-width:720px; }
        .admin-messages-grid { display:grid; grid-template-columns:350px minmax(0,1fr); gap:0; background:#fff; border:1px solid #e5eaf0; border-radius:16px; overflow:hidden; min-height:calc(100vh - 120px); }
        .admin-messages-rail { padding:14px; border-right:1px solid #edf2f7; min-width:0; }
        .admin-messages-thread { min-width:0; display:flex; flex-direction:column; overflow:hidden; }
        .admin-messages-thread-body { flex:1; min-height:360px; overflow-y:auto; padding:18px; display:grid; align-content:start; gap:10px; overscroll-behavior:contain; }
        .admin-messages-bubble { max-width:min(80%,700px); overflow-wrap:anywhere; word-break:break-word; }
        .admin-messages-thread-header { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; border-bottom:1px solid #edf2f7; font-weight:900; background:#fff; }
        .admin-messages-back { display:none; }
        .admin-messages-reply { padding:14px; border-top:1px solid #edf2f7; display:flex; gap:8px; align-items:flex-end; background:#fff; }
        .admin-messages-reply textarea { flex:1; min-width:0; box-sizing:border-box; }
        .admin-conversation-button { width:100%; min-width:0; text-align:left; border:0; padding:12px; margin-bottom:7px; border-radius:10px; cursor:pointer; }
        .admin-conversation-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        @media (max-width: 760px) {
          .admin-messages-page { padding:10px; }
          .admin-messages-header { margin:2px 4px 10px; }
          .admin-messages-header h1 { font-size:22px; }
          .admin-messages-header p { font-size:12px; }
          .admin-messages-header-count { font-size:11px; white-space:nowrap; }
          .admin-messages-grid { display:block; min-height:calc(100dvh - 92px); border-radius:14px; }
          .admin-messages-rail { min-height:calc(100dvh - 92px); }
          .admin-messages-rail.hidden-mobile,.admin-messages-thread.hidden-mobile { display:none; }
          .admin-messages-thread { min-height:calc(100dvh - 92px); height:calc(100dvh - 92px); }
          .admin-messages-thread-header { position:sticky; top:0; z-index:2; padding:10px 12px; }
          .admin-messages-back { display:inline-flex; align-items:center; border:1px solid #d9e2ec; background:#fff; color:#243b53; border-radius:9px; padding:7px 9px; font-weight:800; margin-right:8px; }
          .admin-thread-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .admin-messages-thread-body { min-height:0; padding:12px; gap:8px; }
          .admin-messages-bubble { max-width:88%; font-size:14px; }
          .admin-messages-reply { padding:10px; }
          .admin-messages-reply textarea { min-height:44px; max-height:120px; }
          .admin-messages-reply button { min-height:44px; padding:10px 14px !important; }
        }
      `}</style>

      <div className="admin-messages-shell">
        <div className="admin-messages-header">
          <div><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED INTERNAL WORKFORCE</div><h1 style={{ margin: '4px 0' }}>BIMED Message Centre</h1><p>Message recruitment intakes and internal BIMED staff directly. Staff can reply from their Staff Portal inbox.</p></div>
          <div className="admin-messages-header-count" style={{ fontWeight: 900, color: unreadCount ? '#b42318' : '#627d98' }}>{unreadCount ? `${unreadCount} unread` : 'All conversations read'}</div>
        </div>

        <div className="admin-messages-grid">
          <aside className={`admin-messages-rail ${active ? 'hidden-mobile' : ''}`}>
            <form onSubmit={startMessage} style={{ border: '1px solid #e5eaf0', background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>New message</div><div style={{ fontSize: 12, color: '#627d98', marginBottom: 8 }}>Choose the recipient by name.</div>
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, marginBottom: 8 }}><option value="">Choose staff member…</option>{groupedDirectory.map((person) => <option key={person.id} value={person.id}>{person.application_id ? 'NEW INTAKE' : 'INTERNAL'} · {person.preferred_name || person.full_name} · {person.role || person.department || 'BIMED staff'}</option>)}</select>
              <textarea value={newDraft} onChange={(e) => setNewDraft(e.target.value)} rows={3} placeholder="Write a BIMED workplace message…" style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, resize: 'vertical' }} />
              <button disabled={sendingNew || !recipient || !newDraft.trim()} style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{sendingNew ? 'Sending…' : 'Send new message'}</button>
            </form>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" style={{ width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #cbd5e1', borderRadius: 10, marginBottom: 12 }} />
            {visible.length === 0 ? <div style={{ padding: 10, color: '#627d98', fontSize: 13 }}>No conversations yet.</div> : visible.map((r) => <button key={r.id} onClick={() => void open(r.id)} className="admin-conversation-button" style={{ background: active === r.id ? '#e6fffb' : '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{r.participants.length ? r.participants.map((p: any) => p.preferred_name || p.full_name).join(' ↔ ') : 'BIMED Admin / Staff'}</strong>{r.unread && <span style={{ color: '#0f766e', fontWeight: 900 }}>●</span>}</div><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>{r.participants.map((p: any) => <span key={p.id} style={{ fontSize: 10, padding: '3px 6px', borderRadius: 999, background: p.application_id ? '#e6fffb' : '#f4f7fb', color: p.application_id ? '#0f766e' : '#486581', fontWeight: 900 }}>{p.application_id ? 'NEW INTAKE' : 'INTERNAL'}</span>)}</div><div className="admin-conversation-preview" style={{ fontSize: 12, color: '#829ab1', marginTop: 4 }}>{r.latest?.body || ''}</div></button>)}
          </aside>

          <section className={`admin-messages-thread ${!active ? 'hidden-mobile' : ''}`}>
            {!active ? <div style={{ margin: 'auto', padding: 32, color: '#627d98', textAlign: 'center' }}>Choose a staff member to start a message, or open an existing conversation.</div> : <>
              <div className="admin-messages-thread-header"><div className="admin-thread-title"><button type="button" className="admin-messages-back" onClick={() => setActive('')}>← Inbox</button>{activeRow?.participants?.map((p: any) => p.preferred_name || p.full_name).join(' ↔ ') || 'BIMED conversation'}</div>{olderCursor && <button onClick={() => void loadOlder()} disabled={loadingOlder} style={{ padding: '6px 9px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>{loadingOlder ? 'Loading…' : 'Load older'}</button>}</div>
              <div className="admin-messages-thread-body">{messages.map((m) => <div key={m.id} className="admin-messages-bubble" style={{ justifySelf: m.sender_admin_email ? 'end' : 'start', background: m.sender_admin_email ? '#0f766e' : '#f4f7fb', color: m.sender_admin_email ? '#fff' : '#243b53', borderRadius: 14, padding: '10px 13px' }}><div style={{ fontSize: 11, fontWeight: 800, opacity: .75, marginBottom: 3 }}>{m.sender_admin_email ? `BIMED Admin · ${m.sender_admin_email}` : 'Staff'}</div><div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div><div style={{ fontSize: 10, opacity: .7, marginTop: 5 }}>{new Date(m.created_at).toLocaleString('en-IE')}</div></div>)}</div>
              <form className="admin-messages-reply" onSubmit={(e) => { e.preventDefault(); void reply(); }}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Reply as BIMED Admin / HR…" /><button type="submit" disabled={!draft.trim()} style={{ padding: '10px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>Send</button></form>
            </>}
          </section>
        </div>
        {error && <p style={{ color: '#b42318' }}>{error}</p>}
      </div>
    </main>
  );
}
