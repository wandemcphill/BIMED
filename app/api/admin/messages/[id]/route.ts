import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSession } from '@/lib/admin-session';
import { createStaffNotification } from '@/lib/staff';

const MESSAGE_PAGE_SIZE = 50;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();

  const { data: conversation, error: conversationError } = await client
    .from('recruitment_staff_conversations')
    .select('id,created_at,updated_at,last_message_at,admin_last_read_at,admin_last_read_by')
    .eq('id', id)
    .maybeSingle();
  if (conversationError || !conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const before = request.nextUrl.searchParams.get('before');
  const messageQuery = client.from('recruitment_staff_messages')
    .select('id,sender_staff_id,sender_admin_email,body,created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) messageQuery.lt('created_at', before);

  const [{ data: participants }, { data: messages, error: messageError }] = await Promise.all([
    client.from('recruitment_staff_conversation_participants').select('staff_id').eq('conversation_id', id),
    messageQuery,
  ]);
  if (messageError) return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });

  const ids = (participants || []).map((p: any) => p.staff_id);
  const { data: staff } = ids.length
    ? await client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role,status').in('id', ids)
    : { data: [] };
  const orderedMessages = (messages || []).reverse();
  const nextCursor = messages && messages.length === MESSAGE_PAGE_SIZE ? messages[0]?.created_at || null : null;

  if (!before) {
    await client.from('recruitment_staff_conversations')
      .update({ admin_last_read_at: new Date().toISOString(), admin_last_read_by: session.email })
      .eq('id', id);
  }

  return NextResponse.json({ conversation: { ...conversation, participants: staff || [] }, messages: orderedMessages, nextCursor });
}

export async function POST(request: NextRequest, context: Context) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `admin-message-send:${session.email}:${request.nextUrl.pathname}`, limit: 60, windowMs: 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'You are sending messages too quickly. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  const client = db();

  const { data: conversation } = await client.from('recruitment_staff_conversations').select('id').eq('id', id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const { data: participantRows } = await client.from('recruitment_staff_conversation_participants').select('staff_id').eq('conversation_id', id);
  if (!participantRows?.length) return NextResponse.json({ error: 'Conversation has no staff recipient.' }, { status: 422 });

  const { data: created, error } = await client.from('recruitment_staff_messages')
    .insert({ conversation_id: id, sender_admin_email: session.email, body: message })
    .select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at')
    .single();
  if (error || !created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  const now = new Date().toISOString();
  await client.from('recruitment_staff_conversations').update({ last_message_at: created.created_at || now, updated_at: now }).eq('id', id);

  await Promise.all((participantRows || []).map((row: any) => createStaffNotification(client, {
    staffId: row.staff_id,
    category: 'message',
    title: 'New BIMED message',
    body: 'BIMED Admin / HR sent you a message in BIMED Messages.',
    actionUrl: `/staff/messages?conversation=${encodeURIComponent(id)}`,
  })));

  return NextResponse.json({ message: created }, { status: 201 });
}
