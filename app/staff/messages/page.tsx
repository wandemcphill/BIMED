'use client';

import { FormEvent, useEffect, useState } from 'react';

type Conversation = { id: string; other: any; latest: any; unread: boolean; isAdminThread?: boolean };
type AdminRecipient = { id: string; name: string; title: string; email: string; portalAddress: string; bimedId: string };
type Message = { id: string; sender_staff_id: string | null; sender_admin_email: string | null; body: string; created_at: string };

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

  async function load() {
    const response = await fetch('/api/staff/messages', { cache: 'no-store' });
    if (!response.ok) { setError('Unable to load BIMED Messages.'); return; }
    const data = await response.json();
    setMailbox(data.mailbox); setStaffType(data.staffType || ''); setConversations(data.conversations || []); setAdminRecipients(data.adminRecipients || []); setNotices(data.notices || null);
    if (!to && data.adminRecipients?.length) setTo(data.adminRecipients[0].email);
  }

  async function openConversation(id: string, preserveHistory = false) {
    setActive(id); setError('');
    const response = await fetch(`/api/staff/messages/${id}`, { cache: 'no-store' });
    if (!response.ok) { setError('Unable to open this conversation.'); return; }
    const data = await response.json();
    const incoming = data.messages || [];
    setMessages((current) => preserveHistory ? Array.from(new Map([...current, ...incoming].map((m: Message) => [m.id, m])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : incoming);
    if (!preserveHistory) setOlderCursor(data.nextCursor || null);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
  }

  async function loadOlder() {
    if (!active || !olderCursor || loadingOlder) return;
    setLoadingOlder(true); setError('');
    try {
      const response = await fetch(`/api/staff/messages/${active}?before=${encodeURIComponent(olderCursor)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load older messages.');
      setMessages((current) => [...(data.messages || []), ...current.filter((item: Message) => !(data.messages || []).some((older: Message) => older.id === item.id))]);
      setOlderCursor(data.nextCursor || null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load older messages.'); } finally { setLoadingOlder(false); }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); if (active) void openConversation(active, true); }, 10000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('conversation');
    if (requested) setActive(requested);
  }, []);

  async function startConversation(event: FormEvent) {
    event.preventDefault(); if (!draft.trim() || !to) return; setBusy(true); setError('');
    try { const response = await fetch('/api/staff/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, message: draft }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to send message.'); setDraft(''); await load(); await openConversation(data.conversation.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to send message.'); } finally { setBusy(false); }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault(); if (!active || !draft.trim()) return; setBusy(true); setError('');
    try { const response = await fetch(`/api/staff/messages/${active}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: draft }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to send message.'); setMessages((items) => [...items, data.message]); setDraft(''); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send message.'); } finally { setBusy(false); }
  }

  const activeConversation = conversations.find((item) => item.id === active);

  return (
    <main className="messages-page">
      <style>{`
        .messages-page { min-height:100vh; background:#f4f7fb; color:#102a43; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .messages-header { background:#fff; border-bottom:1px solid #e5eaf0; padding:18px clamp(16px,5vw,64px); display:flex; justify-content:space-between; align-items:center; gap:16px; }
        .messages-header h1 { margin:4px 0 0; font-size:26px; }
        .messages-header-copy { min-width:0; }
        .messages-mailbox { text-align:right; font-size:13px; min-width:0; }
        .messages-mailbox strong { display:block; overflow-wrap:anywhere; }
        .messages-layout { width:min(1200px,100%); margin:0 auto; padding:20px; display:grid; grid-template-columns:320px minmax(0,1fr); gap:16px; box-sizing:border-box; }
        .messages-rail,.messages-thread { background:#fff; border:1px solid #e5eaf0; border-radius:16px; min-width:0; box-sizing:border-box; }
        .messages-rail { padding:14px; }
        .messages-thread { min-height:calc(100vh - 120px); display:flex; flex-direction:column; overflow:hidden; }
        .messages-thread-body { flex:1; min-height:360px; overflow-y:auto; padding:18px; display:grid; align-content:start; gap:10px; overscroll-behavior:contain; }
        .messages-bubble { max-width:min(78%, 680px); overflow-wrap:anywhere; word-break:break-word; }
        .messages-compose { border-bottom:1px solid #edf2f7; padding-bottom:14px; margin-bottom:14px; }
        .messages-compose select,.messages-compose textarea,.messages-reply textarea { width:100%; box-sizing:border-box; }
        .messages-conversation-button { width:100%; min-width:0; text-align:left; border:0; padding:12px; margin-bottom:6px; border-radius:10px; cursor:pointer; }
        .messages-conversation-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .messages-empty { margin:auto; padding:32px; color:#627d98; text-align:center; max-width:420px; }
        .messages-back { display:none; }
        .messages-reply { border-top:1px solid #edf2f7; padding:14px; display:flex; gap:8px; align-items:flex-end; background:#fff; }
        .messages-reply textarea { flex:1; min-width:0; resize:vertical; }
        @media (max-width: 760px) {
          .messages-header { padding:14px 16px; align-items:flex-start; }
          .messages-header h1 { font-size:21px; }
          .messages-header-subtitle { font-size:12px !important; }
          .messages-mailbox { display:none; }
          .messages-layout { padding:10px; display:block; }
          .messages-rail,.messages-thread { border-radius:14px; }
          .messages-thread { min-height:calc(100dvh - 94px); height:calc(100dvh - 94px); }
          .messages-thread.messages-thread-hidden { display:none; }
          .messages-rail.messages-rail-hidden { display:none; }
          .messages-rail { min-height:calc(100dvh - 94px); }
          .messages-compose { padding-bottom:12px; margin-bottom:12px; }
          .messages-notices { max-height:155px; overflow:auto; }
          .messages-thread-header { position:sticky; top:0; z-index:2; background:#fff; }
          .messages-back { display:inline-flex; align-items:center; gap:6px; border:1px solid #d9e2ec; background:#fff; color:#243b53; border-radius:9px; padding:7px 9px; font-weight:800; }
          .messages-thread-title { display:flex; align-items:center; gap:10px; min-width:0; }
          .messages-thread-title span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .messages-thread-body { min-height:0; padding:12px; gap:8px; }
          .messages-bubble { max-width:88%; font-size:14px; }
          .messages-reply { padding:10px; }
          .messages-reply textarea { min-height:44px; max-height:120px; }
          .messages-reply button { min-height:44px; padding:10px 14px !important; }
        }
      `}</style>

      <header className="messages-header">
        <div className="messages-header-copy">
          <div style={{ color: '#0f766e', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>BIMED HEALTHCARE</div>
          <h1>BIMED Messages</h1>
          <div className="messages-header-subtitle" style={{ marginTop: 5, color: '#627d98', fontSize: 13 }}>{staffType === 'recruitment_intake' ? 'New intake · onboarding and workforce communications' : 'Internal BIMED staff · workplace communications'}</div>
        </div>
        {mailbox && <div className="messages-mailbox"><strong>{mailbox.address}</strong><div style={{ color: '#627d98' }}>BIMED internal address</div></div>}
      </header>

      <div className="messages-layout">
        <aside className={`messages-rail ${active ? 'messages-rail-hidden' : ''}`}>
          <form onSubmit={startConversation} className="messages-compose">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Message BIMED Admin / HR</div>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, marginBottom: 8 }}>
              {adminRecipients.map((admin) => <option key={admin.email} value={admin.email}>{admin.name} · {admin.email}</option>)}
              {!adminRecipients.length && <option value="">No BIMED admin is currently available</option>}
            </select>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a workplace message…" rows={3} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, resize: 'vertical' }} />
            <button disabled={busy || !draft.trim() || !to} style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending…' : 'Send message'}</button>
          </form>

          {notices && <div className="messages-notices" style={{ background: '#f8fafc', border: '1px solid #e5eaf0', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 12, lineHeight: 1.55 }}><strong>Important</strong><p style={{ margin: '6px 0' }}>{notices.probation}</p><p style={{ margin: 0 }}>{notices.monitoring}</p></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ fontWeight: 900 }}>Inbox</div><div style={{ color: '#0f766e', fontWeight: 900, fontSize: 12 }}>{conversations.filter((item) => item.unread).length ? `${conversations.filter((item) => item.unread).length} unread` : 'All caught up'}</div></div>
          {conversations.length === 0 ? <div style={{ color: '#627d98', fontSize: 13 }}>No messages yet.</div> : conversations.map((item) => <button key={item.id} onClick={() => { setDraft(''); void openConversation(item.id); }} className="messages-conversation-button" style={{ background: active === item.id ? '#e6fffb' : '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{item.isAdminThread ? 'BIMED Admin / HR' : (item.other?.preferred_name || item.other?.full_name || item.other?.display || 'BIMED staff')}</strong>{item.unread && <span style={{ color: '#0f766e', fontWeight: 900 }}>●</span>}</div><div style={{ fontSize: 12, color: '#627d98', marginTop: 3 }}>{item.isAdminThread ? 'Official BIMED workplace inbox' : (item.other?.address || '')}</div><div className="messages-conversation-preview" style={{ fontSize: 12, color: '#829ab1', marginTop: 4 }}>{item.latest?.body || ''}</div></button>)}
        </aside>

        <section className={`messages-thread ${!active ? 'messages-thread-hidden' : ''}`}>
          {!active ? <div className="messages-empty">Choose a BIMED admin above or open an existing conversation.</div> : <>
            <div className="messages-thread-header" style={{ padding: 12, borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 900 }}>
              <div className="messages-thread-title">
                <button type="button" className="messages-back" onClick={() => setActive('')}>← Inbox</button>
                <span>{activeConversation?.isAdminThread ? 'BIMED Admin / HR' : (activeConversation?.other?.preferred_name || activeConversation?.other?.full_name || 'Conversation')}</span>
              </div>
              {olderCursor && <button onClick={() => void loadOlder()} disabled={loadingOlder} style={{ padding: '6px 9px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>{loadingOlder ? 'Loading…' : 'Load older'}</button>}
            </div>
            <div className="messages-thread-body">
              {messages.map((message) => <div key={message.id} className="messages-bubble" style={{ justifySelf: message.sender_staff_id ? 'start' : 'end', background: message.sender_staff_id ? '#f4f7fb' : '#0f766e', color: message.sender_staff_id ? '#243b53' : '#fff', borderRadius: 14, padding: '10px 13px' }}><div style={{ fontSize: 11, fontWeight: 800, opacity: .75, marginBottom: 3 }}>{message.sender_staff_id ? 'You / Staff' : 'BIMED Admin'}</div><div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div><div style={{ fontSize: 10, opacity: .72, marginTop: 5 }}>{new Date(message.created_at).toLocaleString('en-IE')}</div></div>)}
            </div>
            <form onSubmit={sendReply} className="messages-reply"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply…" rows={2} /><button disabled={busy || !draft.trim()} style={{ padding: '10px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>Send</button></form>
          </>}
        </section>
      </div>
      {error && <div style={{ width: 'min(1200px,100%)', margin: '0 auto', padding: '0 20px 20px', boxSizing: 'border-box', color: '#b42318' }}>{error}</div>}
    </main>
  );
}
