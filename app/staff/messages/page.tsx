'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Conversation = { id: string; other: any; latest: any; unread: boolean; isAdminThread?: boolean };
type AdminRecipient = { id: string; name: string; title: string; email: string; portalAddress: string; bimedId: string };
type Message = { id: string; sender_staff_id: string | null; sender_admin_email: string | null; body: string; created_at: string };

function displayName(person: any) {
  return person?.preferred_name || person?.full_name || person?.display || 'BIMED staff';
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-IE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BimedMessagesPage() {
  const [mailbox, setMailbox] = useState<any>(null);
  const [staffType, setStaffType] = useState('');
  const [adminRecipients, setAdminRecipients] = useState<AdminRecipient[]>([]);
  const [notices, setNotices] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [to, setTo] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const threadBodyRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);

  async function load() {
    const response = await fetch('/api/staff/messages', { cache: 'no-store' });
    if (!response.ok) {
      setError('Unable to load BIMED Messages.');
      return;
    }
    const data = await response.json();
    setMailbox(data.mailbox);
    setStaffType(data.staffType || '');
    setConversations(data.conversations || []);
    setAdminRecipients(data.adminRecipients || []);
    setNotices(data.notices || null);
    if (!to && data.adminRecipients?.length) setTo(data.adminRecipients[0].email);
  }

  async function openConversation(id: string, preserveHistory = false) {
    setActive(id);
    setError('');
    if (!preserveHistory) followLatestRef.current = true;
    const response = await fetch(`/api/staff/messages/${id}`, { cache: 'no-store' });
    if (!response.ok) {
      setError('Unable to open this conversation.');
      return;
    }
    const data = await response.json();
    const incoming = data.messages || [];
    setMessages((current) => preserveHistory
      ? Array.from(new Map([...current, ...incoming].map((m: Message) => [m.id, m])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      : incoming);
    if (!preserveHistory) setOlderCursor(data.nextCursor || null);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
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
      const response = await fetch(`/api/staff/messages/${active}?before=${encodeURIComponent(olderCursor)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load older messages.');
      const older = data.messages || [];
      setMessages((current) => [...older, ...current.filter((item: Message) => !older.some((item2: Message) => item2.id === item.id))]);
      setOlderCursor(data.nextCursor || null);
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
    const requested = new URLSearchParams(window.location.search).get('conversation');
    if (requested) setActive(requested);
  }, []);

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

  async function startConversation(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !to || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/staff/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, message: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send message.');
      setDraft('');
      await load();
      await openConversation(data.conversation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send message.');
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!active || !draft.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/staff/messages/${active}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send message.');
      followLatestRef.current = true;
      setMessages((items) => [...items, data.message]);
      setDraft('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send message.');
    } finally {
      setBusy(false);
    }
  }

  const activeConversation = conversations.find((item) => item.id === active);

  return (
    <main className="messages-page">
      <style>{`
        .messages-page{min-height:100vh;background:#f4f7fb;color:#102a43;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:clamp(10px,2vw,24px);box-sizing:border-box}
        .messages-shell{width:min(1280px,100%);margin:0 auto}
        .messages-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px}
        .messages-header-copy{min-width:0}
        .messages-header h1{margin:4px 0 0;font-size:26px}
        .messages-header-subtitle{margin-top:5px;color:#627d98;font-size:13px}
        .messages-mailbox{text-align:right;font-size:13px;min-width:0}
        .messages-mailbox strong{display:block;overflow-wrap:anywhere}
        .messages-layout{height:calc(100dvh - 154px);min-height:640px;display:grid;grid-template-columns:340px minmax(0,1fr);background:#fff;border:1px solid #dfe7ef;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(16,42,67,.06)}
        .messages-rail{min-width:0;display:flex;flex-direction:column;border-right:1px solid #edf2f7;background:#fbfcfe}
        .messages-compose{padding:14px;border-bottom:1px solid #edf2f7;background:#fff}
        .messages-compose select,.messages-compose textarea{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;outline:none}
        .messages-compose select:focus,.messages-compose textarea:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.1)}
        .messages-compose textarea{resize:vertical;min-height:82px;line-height:1.45}
        .messages-compose button{width:100%;margin-top:8px;padding:10px 12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:900}
        .messages-compose button:disabled{opacity:.5;cursor:not-allowed}
        .messages-notices{margin:12px;border:1px solid #e5eaf0;background:#f8fafc;border-radius:12px;padding:11px 12px;font-size:12px;line-height:1.5}
        .messages-notices strong{color:#243b53}
        .messages-notices p{margin:6px 0 0}
        .messages-list-head{padding:11px 12px 8px;border-top:1px solid #edf2f7;border-bottom:1px solid #edf2f7;background:#fbfcfe}
        .messages-list{min-height:0;overflow:auto;padding:8px}
        .messages-conversation-button{display:block;width:100%;min-width:0;text-align:left;border:1px solid transparent;padding:11px 12px;margin:0 0 6px;border-radius:12px;cursor:pointer;background:#fff;color:#243b53}
        .messages-conversation-button:hover{border-color:#d9e2ec;background:#f8fafc!important}
        .messages-conversation-button.is-active{background:#e8f7f5!important;border-color:#b9e4de}
        .messages-conversation-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;line-height:1.25}
        .messages-conversation-meta{font-size:11px;color:#627d98;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .messages-conversation-preview{display:-webkit-box;overflow:hidden;text-overflow:ellipsis;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;font-size:12px;line-height:1.35;color:#829ab1;margin-top:5px}
        .messages-thread{min-width:0;display:flex;flex-direction:column;background:#fff}
        .messages-thread-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #edf2f7;background:#fff}
        .messages-thread-title{min-width:0;flex:1}
        .messages-thread-name{font-size:16px;font-weight:900;color:#102a43;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .messages-thread-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px}
        .messages-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;background:#f4f7fb;color:#486581}
        .messages-pill.unread{background:#fff4e5;color:#b54708}
        .messages-thread-body{min-height:0;flex:1;overflow-y:auto;padding:18px;background:linear-gradient(#fff,#fbfdfe);overscroll-behavior:contain}
        .messages-thread-stack{display:flex;flex-direction:column;gap:10px;min-height:100%;justify-content:flex-end}
        .messages-bubble{max-width:min(76%,700px);overflow-wrap:anywhere;word-break:break-word;border-radius:15px;padding:11px 14px;box-shadow:0 1px 2px rgba(16,42,67,.05)}
        .messages-bubble.admin{align-self:flex-start;background:#f1f5f9;color:#243b53;border-bottom-left-radius:5px}
        .messages-bubble.staff{align-self:flex-end;background:#0f766e;color:#fff;border-bottom-right-radius:5px}
        .messages-bubble-label{font-size:10px;font-weight:800;opacity:.78;margin-bottom:4px}
        .messages-bubble-body{font-size:14px;line-height:1.55;white-space:pre-wrap}
        .messages-bubble-time{font-size:10px;opacity:.65;margin-top:6px}
        .messages-reply{display:flex;gap:8px;align-items:flex-end;padding:12px 14px;border-top:1px solid #edf2f7;background:#fff}
        .messages-reply textarea{flex:1;min-width:0;resize:none;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:12px;line-height:1.45;max-height:160px;outline:none}
        .messages-reply textarea:focus{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.12)}
        .messages-send{padding:11px 17px;border:0;border-radius:11px;background:#0f766e;color:#fff;font-weight:900;min-height:44px;white-space:nowrap}
        .messages-send:disabled{opacity:.48;cursor:not-allowed}
        .messages-back{display:none}
        .messages-empty{margin:auto;padding:34px;max-width:450px;text-align:center;color:#627d98}
        .messages-empty strong{display:block;color:#243b53;font-size:17px;margin-bottom:6px}
        .messages-error{margin-top:10px;padding:10px 12px;background:#fff1f0;border:1px solid #fecdca;color:#b42318;border-radius:10px;font-size:13px}
        @media(max-width:900px){.messages-layout{grid-template-columns:310px minmax(0,1fr)}.messages-bubble{max-width:84%}}
        @media(max-width:760px){
          .messages-page{padding:10px}
          .messages-header{margin:2px 4px 10px;align-items:flex-end}
          .messages-header h1{font-size:22px}
          .messages-header-subtitle{font-size:12px}
          .messages-mailbox{display:none}
          .messages-layout{height:calc(100dvh - 106px);min-height:0;display:block;border-radius:14px}
          .messages-rail.messages-rail-hidden,.messages-thread.messages-thread-hidden{display:none}
          .messages-rail{height:100%;border-right:0}
          .messages-thread{height:100%}
          .messages-thread-header{padding:10px 12px;position:sticky;top:0;z-index:2}
          .messages-back{display:inline-flex;align-items:center;border:1px solid #d9e2ec;background:#fff;color:#243b53;border-radius:9px;padding:7px 9px;font-weight:800}
          .messages-thread-name{font-size:15px}
          .messages-thread-body{padding:12px}
          .messages-bubble{max-width:90%}
          .messages-reply{padding:10px}
          .messages-reply textarea{min-height:44px;max-height:120px}
          .messages-send{min-height:44px;padding:10px 14px}
          .messages-notices{max-height:155px;overflow:auto}
        }
      `}</style>

      <div className="messages-shell">
        <header className="messages-header">
          <div className="messages-header-copy">
            <div style={{ color: '#0f766e', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>BIMED HEALTHCARE</div>
            <h1>BIMED Messages</h1>
            <div className="messages-header-subtitle">
              {staffType === 'recruitment_intake' ? 'New intake · onboarding and workforce communications' : 'Internal BIMED staff · workplace communications'}
            </div>
          </div>
          {mailbox && <div className="messages-mailbox"><strong>{mailbox.address}</strong><div style={{ color: '#627d98' }}>BIMED internal address</div></div>}
        </header>

        <div className="messages-layout">
          <aside className={`messages-rail ${active ? 'messages-rail-hidden' : ''}`}>
            <form onSubmit={startConversation} className="messages-compose">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Message BIMED Admin / HR</div>
              <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Choose BIMED admin recipient">
                {adminRecipients.map((admin) => <option key={admin.email} value={admin.email}>{admin.name} · {admin.email}</option>)}
                {!adminRecipients.length && <option value="">No BIMED admin is currently available</option>}
              </select>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a workplace message…" rows={3} style={{ marginTop: 8 }} aria-label="New workplace message" />
              <button disabled={busy || !draft.trim() || !to}>{busy ? 'Sending…' : 'Send message'}</button>
            </form>

            {notices && <div className="messages-notices"><strong>Important</strong><p>{notices.probation}</p><p>{notices.monitoring}</p></div>}

            <div className="messages-list-head">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 900 }}>Inbox</div>
                <div style={{ color: '#0f766e', fontWeight: 900, fontSize: 12 }}>{conversations.filter((item) => item.unread).length ? `${conversations.filter((item) => item.unread).length} unread` : 'All caught up'}</div>
              </div>
            </div>

            <div className="messages-list">
              {conversations.length === 0 ? <div style={{ padding: 14, color: '#627d98', fontSize: 13 }}>No messages yet.</div> : conversations.map((item) => (
                <button key={item.id} onClick={() => { setDraft(''); void openConversation(item.id); }} className={`messages-conversation-button ${active === item.id ? 'is-active' : ''}`}>
                  <div className="messages-conversation-title">
                    <strong>{item.isAdminThread ? 'BIMED Admin / HR' : displayName(item.other)}</strong>
                    {item.unread && <span className="messages-pill unread">Unread</span>}
                  </div>
                  <div className="messages-conversation-meta">{item.isAdminThread ? 'Official BIMED workplace inbox' : (item.other?.address || '')}</div>
                  <div className="messages-conversation-preview">{item.latest?.body || 'No message preview available.'}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className={`messages-thread ${!active ? 'messages-thread-hidden' : ''}`}>
            {!active ? (
              <div className="messages-empty"><strong>Select a conversation</strong>Choose BIMED Admin / HR above or open an existing conversation from your inbox.</div>
            ) : (
              <>
                <div className="messages-thread-header">
                  <div className="messages-thread-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="messages-back" onClick={closeConversation}>← Inbox</button>
                      <div className="messages-thread-name">{activeConversation?.isAdminThread ? 'BIMED Admin / HR' : displayName(activeConversation?.other)}</div>
                    </div>
                    <div className="messages-thread-meta">
                      {activeConversation?.isAdminThread ? <span className="messages-pill">Official workplace inbox</span> : <span className="messages-pill">Internal BIMED conversation</span>}
                    </div>
                  </div>
                  {olderCursor && <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} style={{ padding: '7px 10px', border: '1px solid #d9e2ec', background: '#fff', color: '#243b53', borderRadius: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{loadingOlder ? 'Loading…' : 'Load older'}</button>}
                </div>

                <div ref={threadBodyRef} onScroll={handleThreadScroll} className="messages-thread-body">
                  {messages.length === 0 ? <div className="messages-empty"><strong>No messages yet</strong>Send the first message to start the conversation.</div> : (
                    <div className="messages-thread-stack">
                      {messages.map((message) => (
                        <div key={message.id} className={`messages-bubble ${message.sender_staff_id ? 'staff' : 'admin'}`}>
                          <div className="messages-bubble-label">{message.sender_staff_id ? 'You / Staff' : 'BIMED Admin'}</div>
                          <div className="messages-bubble-body">{message.body}</div>
                          <div className="messages-bubble-time">{formatTime(message.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={sendReply} className="messages-reply">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a workplace reply…" rows={2} aria-label="Reply message" />
                  <button type="submit" className="messages-send" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button>
                </form>
              </>
            )}
          </section>
        </div>
        {error && <div className="messages-error">{error}</div>}
      </div>
    </main>
  );
}
