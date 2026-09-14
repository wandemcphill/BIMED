import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStaffSession } from '@/lib/staff-auth';
import { ensureStaffMailbox, findStaffByPortalAddress, getOrCreateAdminConversation, getOrCreateDirectConversation, participantConversationIds } from '@/lib/staff-messaging';
import { BIMED_ADMIN_EMAILS, BIMED_ADMIN_PROBATION_NOTICE, BIMED_MONITORING_NOTICE } from '@/lib/bimed-admin-directory';

function safeText(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,preferred_name,role,status,application_id,department').eq('id', session.staff_id).maybeSingle();
  if (!staff || !['pre_arrival','active','on_leave'].includes(staff.status)) return NextResponse.json({ error: 'Messaging is unavailable for this account.' }, { status: 403 });
  const mailbox = await ensureStaffMailbox(client, staff);
  const ids = await participantConversationIds(client, session.staff_id);
  const adminRecipients = [] as any[];
  for (const admin of BIMED_ADMIN_EMAILS) {
    const { data } = await client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,status,email,portal_address').eq('email', admin.email).maybeSingle();
    if (data && data.id !== session.staff_id) adminRecipients.push({ id: data.id, name: data.preferred_name || data.full_name || admin.name, title: admin.title, email: admin.email, portalAddress: data.portal_address || `${admin.mailboxHandle}@bimedstaff`, bimedId: data.bimed_id });
  }
  const base = { mailbox: { ...mailbox, address: `${mailbox.handle}@${mailbox.namespace}` }, staffType: staff.application_id ? 'recruitment_intake' : 'internal_staff', adminRecipients, notices: { probation: BIMED_ADMIN_PROBATION_NOTICE, monitoring: BIMED_MONITORING_NOTICE } };
  if (!ids.length) return NextResponse.json({ ...base, conversations: [], unreadCount: 0 });
  const { data: conversations } = await client.from('recruitment_staff_conversations').select('id,created_at,updated_at,last_message_at').in('id', ids).order('last_message_at', { ascending: false, nullsFirst: false }).limit(200);
  const rows = [] as any[];
  for (const conversation of conversations || []) {
    const { data: participants } = await client.from('recruitment_staff_conversation_participants').select('staff_id,last_read_at').eq('conversation_id', conversation.id);
    const otherIds = (participants || []).map((p: any) => p.staff_id).filter((id: string) => id !== session.staff_id);
    const { data: other } = otherIds.length ? await client.from('recruitment_staff_mailboxes').select('staff_id,handle,namespace,enabled').in('staff_id', otherIds).eq('enabled', true).limit(1).maybeSingle() : { data: null };
    const { data: otherStaff } = other ? await client.from('recruitment_staff').select('full_name,preferred_name,bimed_id,role,application_id,department,email').eq('id', other.staff_id).maybeSingle() : { data: null };
    const { data: latest } = await client.from('recruitment_staff_messages').select('id,body,sender_staff_id,sender_admin_email,created_at').eq('conversation_id', conversation.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const meParticipant = (participants || []).find((p: any) => p.staff_id === session.staff_id);
    const unread = Boolean(latest && latest.sender_staff_id !== session.staff_id && (!meParticipant?.last_read_at || new Date(latest.created_at).getTime() > new Date(meParticipant.last_read_at).getTime()));
    const isAdminThread = otherIds.length === 0;
    rows.push({ ...conversation, other: other && otherStaff ? { ...otherStaff, address: `${other.handle}@${other.namespace}`, staffType: otherStaff.application_id ? 'recruitment_intake' : 'internal_staff' } : { display: 'BIMED Admin / HR', staffType: 'bimed_admin' }, latest: latest ? { ...latest, body: latest.body.slice(0, 160) } : null, unread, isAdminThread });
  }
  return NextResponse.json({ ...base, conversations: rows, unreadCount: rows.filter((r) => r.unread).length });
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `staff-message-send:${session.staff_id}`, limit: 30, windowMs: 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'You are sending messages too quickly. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });
  const body = await request.json().catch(() => null) as any;
  const to = safeText(body?.to);
  const message = safeText(body?.message);
  if (!to || !message || message.length > 10000) return NextResponse.json({ error: 'Choose a BIMED recipient and enter a message.' }, { status: 400 });
  const client = db();
  const { data: sender } = await client.from('recruitment_staff').select('id,full_name,preferred_name,role,status').eq('id', session.staff_id).maybeSingle();
  if (!sender || !['pre_arrival','active','on_leave'].includes(sender.status)) return NextResponse.json({ error: 'Messaging is unavailable for this account.' }, { status: 403 });
  let conversation;
  if (to === '__bimed_admin__') conversation = await getOrCreateAdminConversation(client, session.staff_id);
  else if (BIMED_ADMIN_EMAILS.some((admin) => admin.email === to)) {
    const { data: recipient } = await client.from('recruitment_staff').select('id,status').eq('email', to).maybeSingle();
    if (!recipient || !['pre_arrival','active','on_leave'].includes(recipient.status)) return NextResponse.json({ error: 'That BIMED admin is unavailable.' }, { status: 404 });
    conversation = await getOrCreateDirectConversation(client, session.staff_id, recipient.id);
  } else {
    const recipient = await findStaffByPortalAddress(client, to);
    if (!recipient || recipient.id === session.staff_id) return NextResponse.json({ error: 'Unable to start a conversation with that BIMED address.' }, { status: 404 });
    conversation = await getOrCreateDirectConversation(client, session.staff_id, recipient.id);
  }
  const { data: created, error } = await client.from('recruitment_staff_messages').insert({ conversation_id: conversation.id, sender_staff_id: session.staff_id, body: message }).select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at').single();
  if (error || !created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  await client.from('recruitment_staff_conversations').update({ last_message_at: created.created_at, updated_at: created.created_at }).eq('id', conversation.id);
  return NextResponse.json({ conversation, message: created }, { status: 201 });
}
