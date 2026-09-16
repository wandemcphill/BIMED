'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Row = { id: string; participants: any[]; latest: any; unread?: boolean };
type Message = { id: string; sender_staff_id: string | null; sender_admin_email: string | null; body: string; created_at: string };
type DirectoryStaff = {
  id: string;
  full_name: string;
  preferred_name?: string | null;
  bimed_id: string;
  role: string | null;
  status: string;
  department: string | null;
  application_id: string | null;
};

function displayName(person: any) {
  return person?.preferred_name || person?.full_name || 'BIMED staff';
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-IE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  const [sendingReply, setSendingReply] = useState(false);
  const threadBodyRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);

  async function load() {
    const r = await fetch('/api/admin/messages', { cache: 'no-store' });
    if (!r.ok) {
      setError('Unable to load message centre.');
      return;
    }
    const d = await r.json();
    setRows(d.conversations || []);
    setDirectory(d.staff || []);
  }

  async function openConversation(id: string, preserveHistory = false) {
    setActive(id);
    setError('');
    if (!preserveHistory) followLatestRef.current = true;
    const r = await fetch(`/api/admin/messages/${id}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('Unable to open conversation.');
      return;
    }
    const d = await r.json();
    const incoming = d.messages || [];
    setMessages((current) => preserveHistory
      ? Array.from(new Map([...current, ...incoming].map((m: Message) => [m.id, m])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      : incoming);
    if (!preserveHistory) setOlderCursor(d.nextCursor || null);
    setRows((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
  }

  async function loadOlder() {
    if (!active || !olderCursor || loadingOlder) return;
    const element = threadBodyRef.current;
    const previousHeight = element?.scrollHeight || 0;
    const previousTop = element?.scrollTop || 0;
    setLoadingOlder(true);
    setError('');
    followLatestRef.current = false;
    try {
      const r = await fetch(`/api/admin/messages/${active}?before=${encodeURIComponent(olderCursor)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to load older messages.');
      const older = d.messages || [];
      setMessages((current) => [...older, ...current.filter((item) => !older.some((item2: Message) => item2.id === item.id))]);
      setOlderCursor(d.nextCursor || null);
      requestAnimationFrame(() => {
        const currentElement = threadBodyRef.current;
        if (!currentElement) return;
        currentElement.scrollTop = previousTop + (currentElement.scrollHeight - previousHeight);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
      if (active) void openConversation(active, true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || !threadBodyRef.current || !followLatestRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = threadBodyRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, messages.length]);

  function handleThreadScroll() {
    const element = threadBodyRef.current;
    if (!element) return;
    followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  function closeConversation() {
    setActive('');
    setMessages([]);
    setOlderCursor(null);
    setDraft('');
    setError('');
    followLatestRef.current = true;
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim() || sendingReply) return;
    setSendingReply(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/messages/${active}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: draft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to send.');
      followLatestRef.current = true;
      setMessages((items) => [...items, d.message]);
      setDraft('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send.');
    } finally {
      setSendingReply(false);
    }
  }

  async function startMessage(event: FormEvent) {
    event.preventDefault();
    if (!recipient || !newDraft.trim() || sendingNew) return;
    setSendingNew(true);
    setError('');
    try {
      const r = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: recipient, message: newDraft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to start conversation.');
      setNewDraft('');
      setRecipient('');
      await load();
      await openConversation(d.conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start conversation.');
    } finally {
      setSendingNew(false);
    }
  }

  const visible = rows.filter((r) => !search.trim() || r.participants.some((p: any) => `${displayName(p)} ${p.bimed_id || ''} ${p.address || ''} ${p.role || ''}`.toLowerCase().includes(search.toLowerCase())));
  const groupedDirectory = useMemo(
    () => [...directory].sort((a, b) => Number(!!b.application_id) - Number(!!a.application_id) || a.full_name.localeCompare(b.full_name)),
    [directory],
  );
  const unreadCount = rows.filter((r) => r.unread).length;
  const activeRow = rows.find((r) => r.id === active);
  const activePeople = activeRow?.participants || [];

  return (
    <main className="admin-messages-page">
      <style>{`
        .admin-messages-page{min-height:100vh;background:#f4f7fb;color:#102a43;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:clamp(12px,2vw,24px);box-sizing:border-box}
        .admin-messages-shell{width:min(1380px,100%);margin:0 auto}
        .admin-messages-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px}
        .admin-messages-header p{margin:0;color:#627d98;max-width:780px;line-height:1.5}
        .admin-messages-grid{height:calc(100dvh - 156px);min-height:640px;display:grid;grid-template-columns:360px minmax(0,1fr);background:#fff;border:1px solid #dfe7ef;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(16,42,67,.06)}
        .admin-messages-rail{min-width:0;display:flex;flex-direction:column;border-right:1px solid #edf2f7;background:#fbfcfe}
        .admin-messages-compose{padding:14px;border-bottom:1px solid #edf2f7;background:#fff}
        .admin-messages-list-head{padding:12px 14px 8px;background:#fbfcfe;border-bottom:1px solid #edf2f7}
        .admin-messages-list{min-height:0;overflow:auto;padding:8px}
        .admin-conversation-button{display:block;width:100%;min-width:0;text-align:left;border:1px solid transparent;padding:11px 12px;margin:0 0 6px;border-radius:12px;cursor:pointer;background:#fff;color:#243b53}
        .admin-conversation-button:hover{border-color:#d9e2ec;background:#f8fafc!important}
        .admin-conversation-button.is-active{background:#e8f7f5!important;border-color:#b9e4de}
        .admin-conversation-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;line-height:1.25}
        .admin-conversation-preview{display:-webkit-box;overflow:hidden;text-overflow:ellipsis;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;font-size:12px;line-height:1.35;color:#829ab1;margin-top:5px}
        .admin-messages-thread{min-width:0;display:flex;flex-direction:column;background:#fff}
        .admin-messages-thread-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #edf2f7;background:#fff}
        .admin-thread-heading{min-width:0}
        .admin-thread-name{font-size:16px;font-weight:900;color:#102a43;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .admin-thread-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px}
        .admin-thread-body{min-height:0;flex:1;overflow-y:auto;padding:18px;background:linear-gradient(#ffffff,#fbfdfe);overscroll-behavior:contain}
        .admin-thread-stack{display:flex;flex-direction:column;gap:10px;min-height:100%;justify-content:flex-end}
        .admin-messages-bubble{max-width:min(76%,720px);overflow-wrap:anywhere;word-break:break-word;border-radius:15px;padding:11px 14px;box-shadow:0 1px 2px rgba(16,42,67,.05)}
        .admin-messages-bubble.admin{align-self:flex-end;background:#0f766e;color:#fff;border-bottom-right-radius:5px}
        .admin-messages-bubble.staff{align-self:flex-start;background:#f1f5f9;color:#243b53;border-bottom-left-radius:5px}
        .admin-bubble-label{font-size:10px;font-weight:800;opacity:.78;margin-bottom:4px;letter-spacing:.1px}
        .admin-bubble-body{font-size:14px;line-height:1.55;white-space:pre-wrap}
        .admin-bubble-time{font-size:10px;opacity:.66;margin-top:6px}
        .admin-messages-reply{display:flex;gap:8px;align-items:flex-end;padding:12px 14px;border-top:1px solid #edf2f7;background:#fff}
        .admin-messages-reply textarea{flex:1;min-width:0;resize:none;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:12px;line-height:1.45;max-height:160px;outline:none}
        .admin-messages-reply textarea:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.12)}
        .admin-send{padding:11px 17px;border:0;border-radius:11px;background:#0f766e;color:#fff;font-weight:900;min-height:44px;white-space:nowrap}
        .admin-send:disabled{opacity:.48;cursor:not-allowed}
        .admin-messages-back{display:none}
        .admin-empty-thread{margin:auto;padding:34px;max-width:460px;text-align:center;color:#627d98}
        .admin-empty-thread strong{display:block;color:#243b53;font-size:17px;margin-bottom:6px}
        .admin-error{margin-top:10px;padding:10px 12px;background:#fff1f0;border:1px solid #fecdca;color:#b42318;border-radius:10px;font-size:13px}
        .admin-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;background:#f4f7fb;color:#486581}
        .admin-pill.intake{background:#e6fffb;color:#0f766e}
        .admin-pill.unread{background:#fff4e5;color:#b54708}
        .admin-list-count{font-size:12px;font-weight:900;color:#627d98}
        .admin-search{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;outline:none}
        .admin-search:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.1)}
        .admin-compose-select,.admin-compose-textarea{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;outline:none}
        .admin-compose-textarea{resize:vertical;min-height:82px;line-height:1.45}
        .admin-compose-select:focus,.admin-compose-textarea:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.1)}
        .admin-compose-button{width:100%;margin-top:8px;padding:10px 12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:900}
        .admin-compose-button:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:900px){.admin-messages-grid{grid-template-columns:320px minmax(0,1fr)}.admin-messages-bubble{max-width:84%}}
        @media(max-width:760px){
          .admin-messages-page{padding:10px}
          .admin-messages-header{margin:2px 4px 10px;align-items:flex-end}
          .admin-messages-header h1{font-size:22px}
          .admin-messages-header p{font-size:12px}
          .admin-messages-header-count{font-size:11px;white-space:nowrap}
          .admin-messages-grid{height:calc(100dvh - 106px);min-height:0;display:block;border-radius:14px}
          .admin-messages-rail.hidden-mobile,.admin-messages-thread.hidden-mobile{display:none}
          .admin-messages-rail{height:100%;border-right:0}
          .admin-messages-thread{height:100%}
          .admin-messages-back{display:inline-flex;align-items:center;border:1px solid #d9e2ec;background:#fff;color:#243b53;border-radius:9px;padding:7px 9px;font-weight:800}
          .admin-messages-thread-header{padding:10px 12px}
          .admin-thread-heading{min-width:0;flex:1}
          .admin-thread-name{font-size:15px}
          .admin-thread-body{padding:12px}
          .admin-messages-bubble{max-width:90%;font-size:14px}
          .admin-messages-reply{padding:10px}
          .admin-messages-reply textarea{min-height:44px;max-height:120px}
          .admin-send{min-height:44px;padding:10px 14px}
        }
      `}</style>

      <div className="admin-messages-shell">
        <div className="admin-messages-header">
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>BIMED INTERNAL WORKFORCE</div>
            <h1 style={{ margin: '4px 0' }}>BIMED Message Centre</h1>
            <p>Message recruitment intakes and internal BIMED staff directly. Every conversation stays in the authenticated staff/admin inbox.</p>
          </div>
          <div className="admin-messages-header-count" style={{ fontWeight: 900, color: unreadCount ? '#b42318' : '#627d98' }}>
            {unreadCount ? `${unreadCount} unread` : 'All conversations read'}
          </div>
        </div>

        <div className="admin-messages-grid">
          <aside className={`admin-messages-rail ${active ? 'hidden-mobile' : ''}`}>
            <form onSubmit={startMessage} className="admin-messages-compose">
              <div style={{ fontWeight: 900, marginBottom: 4 }}>New message</div>
              <div style={{ fontSize: 12, color: '#627d98', marginBottom: 8 }}>Choose a recipient by name. No BIMED ID needs to be typed.</div>
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)} className="admin-compose-select" aria-label="Choose staff recipient">
                <option value="">Choose staff member…</option>
                {groupedDirectory.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.application_id ? 'NEW INTAKE' : 'INTERNAL'} · {person.preferred_name || person.full_name} · {person.role || person.department || 'BIMED staff'}
                  </option>
                ))}
              </select>
              <textarea value={newDraft} onChange={(e) => setNewDraft(e.target.value)} rows={3} placeholder="Write a BIMED workplace message…" className="admin-compose-textarea" style={{ marginTop: 8 }} />
              <button className="admin-compose-button" disabled={sendingNew || !recipient || !newDraft.trim()}>
                {sendingNew ? 'Sending…' : 'Send new message'}
              </button>
            </form>

            <div className="admin-messages-list-head">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, ID or conversation…" className="admin-search" aria-label="Search conversations" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div style={{ fontWeight: 900 }}>Inbox</div>
                <div className="admin-list-count">{visible.length} conversation{visible.length === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div className="admin-messages-list">
              {visible.length === 0 ? (
                <div style={{ padding: 14, color: '#627d98', fontSize: 13 }}>No conversations match your search.</div>
              ) : visible.map((r) => {
                const names = r.participants.map((p: any) => displayName(p)).join(' ↔ ') || 'BIMED Admin / Staff';
                return (
                  <button key={r.id} onClick={() => void openConversation(r.id)} className={`admin-conversation-button ${active === r.id ? 'is-active' : ''}`}>
                    <div className="admin-conversation-title">
                      <strong>{names}</strong>
                      {r.unread && <span className="admin-pill unread">Unread</span>}
                    </div>
                    <div className="admin-thread-meta">
                      {r.participants.map((p: any) => <span key={p.id} className={`admin-pill ${p.application_id ? 'intake' : ''}`}>{p.application_id ? 'NEW INTAKE' : 'INTERNAL'}</span>)}
                    </div>
                    <div className="admin-conversation-preview">{r.latest?.body || 'No message preview available.'}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={`admin-messages-thread ${!active ? 'hidden-mobile' : ''}`}>
            {!active ? (
              <div className="admin-empty-thread">
                <strong>Select a conversation</strong>
                Open an existing conversation from the inbox, or use New message to contact a staff member.
              </div>
            ) : (
              <>
                <div className="admin-messages-thread-header">
                  <div className="admin-thread-heading">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="admin-messages-back" onClick={closeConversation}>← Inbox</button>
                      <div className="admin-thread-name">{activePeople.map((p: any) => displayName(p)).join(' ↔ ') || 'BIMED conversation'}</div>
                    </div>
                    <div className="admin-thread-meta">
                      {activePeople.map((p: any) => <span key={p.id} className={`admin-pill ${p.application_id ? 'intake' : ''}`}>{p.application_id ? 'NEW INTAKE' : 'INTERNAL'}{p.bimed_id ? ` · ${p.bimed_id}` : ''}</span>)}
                    </div>
                  </div>
                  {olderCursor && <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} style={{ padding: '7px 10px', border: '1px solid #d9e2ec', background: '#fff', color: '#243b53', borderRadius: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{loadingOlder ? 'Loading…' : 'Load older'}</button>}
                </div>

                <div ref={threadBodyRef} onScroll={handleThreadScroll} className="admin-thread-body">
                  {messages.length === 0 ? (
                    <div className="admin-empty-thread"><strong>No messages yet</strong>Send the first message to start the conversation.</div>
                  ) : (
                    <div className="admin-thread-stack">
                      {messages.map((m) => (
                        <div key={m.id} className={`admin-messages-bubble ${m.sender_admin_email ? 'admin' : 'staff'}`}>
                          <div className="admin-bubble-label">{m.sender_admin_email ? `BIMED Admin · ${m.sender_admin_email}` : 'Staff'}</div>
                          <div className="admin-bubble-body">{m.body}</div>
                          <div className="admin-bubble-time">{formatTime(m.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form className="admin-messages-reply" onSubmit={reply}>
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Write a clear workplace reply…" aria-label="Reply message" />
                  <button type="submit" className="admin-send" disabled={sendingReply || !draft.trim()}>{sendingReply ? 'Sending…' : 'Send'}</button>
                </form>
              </>
            )}
          </section>
        </div>
        {error && <div className="admin-error">{error}</div>}
      </div>
    </main>
  );
}
