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
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5eaf0', padding: '18px 5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div><div style={{ color: '#0f766e', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>BIMED HEALTHCARE</div><h1 style={{ margin: '4px 0 0', fontSize: 26 }}>BIMED Messages</h1><div style={{ marginTop: 5, color: '#627d98', fontSize: 13 }}>{staffType === 'recruitment_intake' ? 'New intake · onboarding and workforce communications' : 'Internal BIMED staff · workplace communications'}</div></div>
        {mailbox && <div style={{ textAlign: 'right', fontSize: 13 }}><div style={{ fontWeight: 900 }}>{mailbox.address}</div><div style={{ color: '#627d98' }}>BIMED internal address</div></div>}
      </header>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 16 }}>
        <aside style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 14 }}>
          <form onSubmit={startConversation} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Message BIMED Admin / HR</div>
            <select value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, boxSizing: 'border-box', marginBottom: 8 }}>
              {adminRecipients.map((admin) => <option key={admin.email} value={admin.email}>{admin.name} · {admin.email} · {admin.title}</option>)}
              {!adminRecipients.length && <option value=''>No BIMED admin is currently available</option>}
            </select>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a workplace message…" rows={3} style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, boxSizing: 'border-box', resize: 'vertical' }} />
            <button disabled={busy || !draft.trim() || !to} style={{ width: '100%', marginTop: 8, padding: 10, border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending…' : 'Send message'}</button>
          </form>
          {notices && <div style={{ background: '#f8fafc', border: '1px solid #e5eaf0', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 12, lineHeight: 1.55 }}><strong>Important</strong><p style={{ margin: '6px 0' }}>{notices.probation}</p><p style={{ margin: 0 }}>{notices.monitoring}</p></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ fontWeight: 900 }}>Inbox</div><div style={{ color: '#0f766e', fontWeight: 900, fontSize: 12 }}>{conversations.filter((item) => item.unread).length ? `${conversations.filter((item) => item.unread).length} unread` : 'All caught up'}</div></div>
          {conversations.length === 0 ? <div style={{ color: '#627d98', fontSize: 13 }}>No messages yet.</div> : conversations.map((item) => <button key={item.id} onClick={() => { setDraft(''); void openConversation(item.id); }} style={{ width: '100%', textAlign: 'left', border: 0, background: active === item.id ? '#e6fffb' : '#fff', borderRadius: 10, padding: 12, marginBottom: 6, cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{item.isAdminThread ? 'BIMED Admin / HR' : (item.other?.preferred_name || item.other?.full_name || item.other?.display || 'BIMED staff')}</strong>{item.unread && <span style={{ color: '#0f766e', fontWeight: 900 }}>●</span>}</div><div style={{ fontSize: 12, color: '#627d98', marginTop: 3 }}>{item.isAdminThread ? 'Official BIMED workplace inbox' : (item.other?.address || '')}</div><div style={{ fontSize: 12, color: '#829ab1', marginTop: 4 }}>{item.latest?.body || ''}</div></button>)}
        </aside>
        <section style={{ background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, minHeight: 640, display: 'flex', flexDirection: 'column' }}>
          {!active ? <div style={{ margin: 'auto', color: '#627d98', textAlign: 'center' }}>Choose a BIMED admin above or open an existing conversation.</div> : <><div style={{ padding: 16, borderBottom: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 900 }}><span>{activeConversation?.isAdminThread ? 'BIMED Admin / HR' : (activeConversation?.other?.preferred_name || activeConversation?.other?.full_name || 'Conversation')}</span>{olderCursor && <button onClick={() => void loadOlder()} disabled={loadingOlder} style={{ padding: '6px 9px', border: '1px solid #d9e2ec', background: '#fff', borderRadius: 8, fontWeight: 700 }}>{loadingOlder ? 'Loading…' : 'Load older'}</button>}</div><div style={{ flex: 1, padding: 18, display: 'grid', alignContent: 'start', gap: 10, overflowY: 'auto' }}>{messages.map((message) => <div key={message.id} style={{ justifySelf: message.sender_staff_id ? 'start' : 'end', maxWidth: '78%', background: message.sender_staff_id ? '#f4f7fb' : '#0f766e', color: message.sender_staff_id ? '#243b53' : '#fff', borderRadius: 14, padding: '10px 13px' }}><div style={{ fontSize: 11, fontWeight: 800, opacity: .75, marginBottom: 3 }}>{message.sender_staff_id ? 'You / Staff' : 'BIMED Admin'}</div><div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div><div style={{ fontSize: 10, opacity: .72, marginTop: 5 }}>{new Date(message.created_at).toLocaleString('en-IE')}</div></div>)}</div><form onSubmit={sendReply} style={{ borderTop: '1px solid #edf2f7', padding: 14, display: 'flex', gap: 8 }}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply…" rows={2} style={{ flex: 1, padding: 10, border: '1px solid #cbd5e1', borderRadius: 10, resize: 'vertical' }} /><button disabled={busy || !draft.trim()} style={{ padding: '10px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 900 }}>Send</button></form></>}
        </section>
      </div>
      {error && <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 20px', color: '#b42318' }}>{error}</div>}
    </main>
  );
}
