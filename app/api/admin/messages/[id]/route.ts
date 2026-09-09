import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const [{ data: participants }, { data: messages }] = await Promise.all([
    client.from('recruitment_staff_conversation_participants').select('staff_id,last_read_at').eq('conversation_id', id),
    client.from('recruitment_staff_messages').select('id,sender_staff_id,sender_admin_email,body,created_at,edited_at,deleted_at,attachment_name').eq('conversation_id', id).order('created_at', { ascending: true }),
  ]);
  const ids = (participants || []).map((p: any) => p.staff_id);
  const { data: staff } = ids.length ? await client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role').in('id', ids) : { data: [] };
  return NextResponse.json({ conversation: { id, participants: staff || [] }, messages: messages || [] });
}

export async function POST(request: NextRequest, context: Context) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as any;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
  const client = db();
  const { data: participant } = await client.from('recruitment_staff_conversation_participants').select('staff_id').eq('conversation_id', id).limit(1).maybeSingle();
  if (!participant) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  const now = new Date().toISOString();
  const { data: created, error } = await client.from('recruitment_staff_messages').insert({ conversation_id: id, sender_admin_email: session.email, body: message }).select('id,conversation_id,sender_staff_id,sender_admin_email,body,created_at,edited_at').single();
  if (error || !created) return NextResponse.json({ error: 'Unable to send message.' }, { status: 500 });
  await client.from('recruitment_staff_conversations').update({ last_message_at: created.created_at || now, updated_at: now }).eq('id', id);
  return NextResponse.json({ message: created }, { status: 201 });
}
