'use client';

import { FormEvent, useEffect, useState } from 'react';

type Conversation = { id: string; other: any; latest: any; unread: boolean };
type Message = { id: string; sender_staff_id: string | null; sender_admin_email: string | null; body: string; created_at: string };

export default function BimedMessagesPage() {
  const [mailbox, setMailbox] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [to, setTo] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/staff/messages', { cache: 'no-store' });
    if (!response.ok) { setError('Unable to load BIMED Messages.'); return; }
    const data = await response.json();
    setMailbox(data.mailbox); setConversations(data.conversations || []);
  }
  async function openConversation(id: string) {
    setActive(id); setError('');
    const response = await fetch(`/api/staff/messages/${id}`, { cache: 'no-store' });
    if (!response.ok) { setError('Unable to open this conversation.'); return; }
    const data = await response.json(); setMessages(data.messages || []);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unread: false } : item));
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); if (active) void openConversation(active); }, 10000); return () => window.clearInterval(timer); }, [active]);
  async function startConversation(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, message: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send message.');
      setTo(''); setDraft(''); await load(); await openConversation(data.conversation.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send message.'); } finally { setBusy(false); }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault(); if (!active || !draft.trim()) return; setBusy(true); setError('');
    try { const response = await fetch(`/api/staff/messages/${active}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: draft }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to send message.'); setMessages((items) => [...items, data.message]); setDraft(''); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to send message.'); } finally { setBusy(false); }
  }
  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5eaf0', padding: '18px 5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div><div style={{ color: '#0f766e', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>BIMED HEALTHCARE</div><h1 style={{ margin: '4px 0 0', fontSize: 26 }}>BIMED Messages</h1></div>
        {mailbox && <div style={{ textAlign: 'right', fontSize: 13 }}><div style={{ fontWeight: 900 }}>{mailbox.address}</div><div style={{ color: '#627d98' }}>BIMED internal address</div></div>}
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 16 }}>
        <aside style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 14 }}>
          <form onSubmit={startConversation} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>New message</div>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="staff@bimedcare / staff@bimedphysio" style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, boxSizing: 'border-box', marginBottom: 8 }} />
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" rows={3} style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, boxSizing: 'border-box', resize: 'vertical' }} />
            <button disabled={busy} style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending…' : 'Send'}</button>
          </form>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Inbox</div>
          {conversations.length === 0 ? <div style={{ color: '#627d98', fontSize: 13 }}>No messages yet.</div> : conversations.map((item) => <button key={item.id} onClick={() => { setDraft(''); void openConversation(item.id); }} style={{ width: '100%', textAlign: 'left', border: 0, background: active === item.id ? '#e6fffb' : '#fff', borderRadius: 10, padding: 12, marginBottom: 6, cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{item.other?.preferred_name || item.other?.full_name || item.other?.display || 'BIMED Admin'}</strong>{item.unread && <span style={{ color: '#0f766e', fontWeight: 900 }}>●</span>}</div><div style={{ fontSize: 12, color: '#627d98', marginTop: 3 }}>{item.other?.address || ''}</div><div style={{ fontSize: 12, color: '#829ab1', marginTop: 4 }}>{item.latest?.body || ''}</div></button>)}
        </aside>
        <section style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, minHeight: 640, display: 'flex', flexDirection: 'column' }}>
          {!active ? <div style={{ margin: 'auto', color: '#627d98', textAlign: 'center' }}>Select a conversation or start a new BIMED message.</div> : <><div style={{ padding: 16, borderBottom: '1px solid #edf2f7', fontWeight: 900 }}>Conversation</div><div style={{ flex: 1, padding: 18, display: 'grid', alignContent: 'start', gap: 10, overflowY: 'auto' }}>{messages.map((message) => <div key={message.id} style={{ justifySelf: message.sender_staff_id ? 'start' : 'end', maxWidth: '78%', background: message.sender_staff_id ? '#f4f7fb' : '#0f766e', color: message.sender_staff_id ? '#243b53' : '#fff', borderRadius: 14, padding: '10px 13px' }}><div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div><div style={{ fontSize: 10, opacity: .72, marginTop: 5 }}>{new Date(message.created_at).toLocaleString('en-IE')}</div></div>)}</div><form onSubmit={sendReply} style={{ borderTop: '1px solid #edf2f7', padding: 14, display: 'flex', gap: 8 }}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply…" rows={2} style={{ flex: 1, padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, resize: 'vertical' }} /><button disabled={busy || !draft.trim()} style={{ padding: '10px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>Send</button></form></>}
        </section>
      </div>
      {error && <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 20px', color: '#b42318' }}>{error}</div>}
    </main>
  );
}
