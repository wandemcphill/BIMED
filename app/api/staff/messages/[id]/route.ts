import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStaffSession } from '@/lib/staff-auth';
import { participantConversationIds } from '@/lib/staff-messaging';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const ids = await participantConversationIds(client, session.staff_id);
  if (!ids.includes(id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const { data: participants } = await client.from('recruitment_staff_conversation_participants').select('staff_id,last_read_at').eq('conversation_id', id);
  const otherId = (participants || []).map((p: any) => p.staff_id).find((staffId: string) => staffId !== session.staff_id);
  const [{ data: other }, { data: messages }] = await Promise.all([
    otherId ? client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role').eq('id', otherId).maybeSingle() : Promise.resolve({ data: null }),
    client.from('recruitment_staff_messages').select('id,sender_staff_id,sender_admin_email,body,created_at,edited_at,deleted_at,attachment_name').eq('conversation_id', id).order('created_at', { ascending: false }).limit(500),
  ]);
  const orderedMessages = (messages || []).reverse();
  await client.from('recruitment_staff_conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('staff_id', session.staff_id);
  return NextResponse.json({ conversation: { id, other: other || { display: 'BIMED Admin' } }, messages: orderedMessages });
}

export async function POST(request: NextRequest, context: Context) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const limiter = await checkRateLimit({ key: `staff-message-send:${session.staff_id}`, limit: 30, windowMs: 60 * 1000, request });
  if (!limiter.allowed) return NextResponse.json({ error: 'You are sending messages too quickly. Please wait a moment.' }, { status: 429, headers: { 'Retry-After': String(limiter.retryAfterSeconds || 60) } });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  const client = db();
  const ids = await participantConversationIds(client, session.staff_id);
  if (!ids.includes(id)) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const { data: created, error } = await client.from('recruitment_staff_messages').insert({ conversation_id: id, sender_staff_id: session.staff_id, body: message }).select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,edited_at').single();
  if (error || !created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  await client.from('recruitment_staff_conversations').update({ last_message_at: created.created_at, updated_at: created.created_at }).eq('id', id);
  return NextResponse.json({ message: created }, { status: 201 });
}
