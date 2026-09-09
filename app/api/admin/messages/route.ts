import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const client = db();
  const { data: conversations } = await client.from('recruitment_staff_conversations').select('id,created_at,updated_at,last_message_at').order('last_message_at', { ascending: false, nullsFirst: false });
  const rows = [] as any[];
  for (const conversation of conversations || []) {
    const { data: participants } = await client.from('recruitment_staff_conversation_participants').select('staff_id').eq('conversation_id', conversation.id);
    const ids = (participants || []).map((p: any) => p.staff_id);
    const [{ data: staff }, { data: mailboxes }, { data: latest }] = await Promise.all([
      ids.length ? client.from('recruitment_staff').select('id,full_name,preferred_name,bimed_id,role').in('id', ids) : Promise.resolve({ data: [] }),
      ids.length ? client.from('recruitment_staff_mailboxes').select('staff_id,handle,namespace').in('staff_id', ids) : Promise.resolve({ data: [] }),
      client.from('recruitment_staff_messages').select('id,body,sender_staff_id,sender_admin_email,created_at').eq('conversation_id', conversation.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    rows.push({ ...conversation, participants: (staff || []).map((s: any) => { const m = (mailboxes || []).find((item: any) => item.staff_id === s.id); return { ...s, address: m ? `${m.handle}@${m.namespace}` : null }; }), latest });
  }
  return NextResponse.json({ conversations: rows });
}
