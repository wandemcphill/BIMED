import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffNotification } from '@/lib/staff';
import { ensureStaffMailbox, getOrCreateAdminConversation } from '@/lib/staff-messaging';

const ACTIVE_STAFF_STATUSES = ['pre_arrival', 'active', 'on_leave'] as const;

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const [{ data: conversations }, { data: staffDirectory }] = await Promise.all([
    client.from('recruitment_staff_conversations').select('id,created_at,updated_at,last_message_at,admin_last_read_at,admin_last_read_by').order('last_message_at', { ascending: false, nullsFirst: false }),
    client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role,status,department,application_id,email').in('status', [...ACTIVE_STAFF_STATUSES]).order('full_name', { ascending: true }).limit(250),
  ]);
  const rows = [] as any[];
  for (const conversation of conversations || []) {
    const { data: participants } = await client.from('recruitment_staff_conversation_participants').select('staff_id').eq('conversation_id', conversation.id);
    const ids = (participants || []).map((p: any) => p.staff_id);
    const [{ data: staff }, { data: mailboxes }, { data: latest }] = await Promise.all([
      ids.length ? client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role,application_id,department,status').in('id', ids) : Promise.resolve({ data: [] }),
      ids.length ? client.from('recruitment_staff_mailboxes').select('staff_id,handle,namespace').in('staff_id', ids) : Promise.resolve({ data: [] }),
      client.from('recruitment_staff_messages').select('id,body,sender_staff_id,sender_admin_email,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const unread = Boolean(latest?.sender_staff_id && (!conversation.admin_last_read_at || new Date(latest.created_at).getTime() > new Date(conversation.admin_last_read_at).getTime()));
    rows.push({ ...conversation, participants: (staff || []).map((s: any) => { const m = (mailboxes || []).find((item: any) => item.staff_id === s.id); return { ...s, address: m ? `${m.handle}@${m.namespace}` : null }; }), latest, unread });
  }
  return NextResponse.json({ conversations: rows, staff: staffDirectory || [], unreadCount: rows.filter((row) => row.unread).length });
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `admin-message-send:${session.email}`, limit: 60, windowMs: 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'You are sending messages too quickly. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });

  const body = await request.json().catch(() => null) as any;
  const staffId = typeof body?.staffId === 'string' ? body.staffId.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!staffId || !message || message.length > 10000) return NextResponse.json({ error: 'Choose a staff member and enter a message.' }, { status: 400 });

  const client = db();
  const { data: staff } = await client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role,status,department,application_id').eq('id', staffId).maybeSingle();
  if (!staff || !ACTIVE_STAFF_STATUSES.includes(staff.status as (typeof ACTIVE_STAFF_STATUSES)[number])) return NextResponse.json({ error: 'That staff member is not available for messaging.' }, { status: 404 });

  const mailbox = await ensureStaffMailbox(client, staff);
  const conversation = await getOrCreateAdminConversation(client, staffId);
  const { data: created, error } = await client.from('recruitment_staff_messages')
    .insert({ conversation_id: conversation.id, sender_admin_email: session.email, body: message })
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at')
    .single();
  if (error || !created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  await client.from('recruitment_staff_conversations').update({ last_message_at: created.created_at, updated_at: created.created_at }).eq('id', conversation.id);
  await createStaffNotification(client, {
    staffId,
    category: 'message',
    title: 'New BIMED message',
    body: `BIMED Admin / HR sent you a message in BIMED Messages.`,
    actionUrl: `/staff/messages?conversation=${encodeURIComponent(conversation.id)}`,
  });
  return NextResponse.json({ conversation, message: created, staff: { ...staff, address: `${mailbox.handle}@${mailbox.namespace}` } }, { status: 201 });
}
