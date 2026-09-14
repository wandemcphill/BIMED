import type { SupabaseClient } from '@supabase/supabase-js';

export const BIMED_MESSAGE_NAMESPACES = ['bimedcare', 'bimedphysio', 'bimedstaff'] as const;
type Namespace = (typeof BIMED_MESSAGE_NAMESPACES)[number];

export function normalizePortalAddress(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function namespaceForRole(role: string | null | undefined): Namespace {
  const value = (role || '').toLowerCase();
  if (value.includes('physio')) return 'bimedphysio';
  if (value.includes('nurse') || value.includes('carer') || value.includes('care') || value.includes('support')) return 'bimedcare';
  return 'bimedstaff';
}

export function handleBase(name: string) {
  const parts = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);
  const base = parts.join('.').replace(/[^a-z0-9.]/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  return base || 'staff';
}

export async function ensureStaffMailbox(client: SupabaseClient, staff: { id: string; full_name: string; preferred_name?: string | null; role?: string | null }) {
  const existing = await client.from('recruitment_staff_mailboxes').select('id,staff_id,handle,namespace,enabled').eq('staff_id', staff.id).maybeSingle();
  if (existing.data) return existing.data;
  const namespace = namespaceForRole(staff.role);
  const base = handleBase(staff.preferred_name || staff.full_name);
  for (let i = 1; i <= 100; i++) {
    const handle = i === 1 ? base : `${base}${i}`;
    const address = `${handle}@${namespace}`;
    const collision = await client.from('recruitment_staff_mailboxes').select('id').eq('namespace', namespace).eq('handle', handle).maybeSingle();
    if (collision.data) continue;
    const { data, error } = await client.from('recruitment_staff_mailboxes').insert({ staff_id: staff.id, handle, namespace, enabled: true }).select('id,staff_id,handle,namespace,enabled').single();
    if (!error && data) {
      await client.from('recruitment_staff').update({ department_namespace: namespace, portal_handle: handle, portal_address: address, updated_at: new Date().toISOString() }).eq('id', staff.id);
      return data;
    }
  }
  throw new Error('Unable to allocate a unique BIMED internal address.');
}

export async function findStaffByPortalAddress(client: SupabaseClient, address: string) {
  const normalized = normalizePortalAddress(address);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  const handle = normalized.slice(0, at);
  const namespace = normalized.slice(at + 1);
  if (!BIMED_MESSAGE_NAMESPACES.includes(namespace as Namespace)) return null;
  const { data: mailbox, error } = await client.from('recruitment_staff_mailboxes').select('staff_id,handle,namespace,enabled').eq('handle', handle).eq('namespace', namespace).eq('enabled', true).maybeSingle();
  if (error || !mailbox) return null;
  const { data: staff } = await client.from('recruitment_staff').select('id,bimed_id,full_name,preferred_name,role,status,email').eq('id', mailbox.staff_id).maybeSingle();
  if (!staff || !['pre_arrival', 'active', 'on_leave'].includes(staff.status)) return null;
  return { ...staff, mailbox };
}

export function directKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

export async function getOrCreateDirectConversation(client: SupabaseClient, a: string, b: string) {
  const key = directKey(a, b);
  const existing = await client.from('recruitment_staff_conversations').select('id,direct_key,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
  if (existing.data) return existing.data;
  const { data: conversation, error } = await client.from('recruitment_staff_conversations').insert({ direct_key: key, created_by_staff_id: a }).select('id,direct_key,created_at,updated_at,last_message_at').single();
  if (error || !conversation) {
    const retry = await client.from('recruitment_staff_conversations').select('id,direct_key,created_at,updated_at,last_message_at').eq('direct_key', key).maybeSingle();
    if (retry.data) return retry.data;
    throw error || new Error('Unable to create conversation.');
  }
  const { error: participantError } = await client.from('recruitment_staff_conversation_participants').insert([{ conversation_id: conversation.id, staff_id: a }, { conversation_id: conversation.id, staff_id: b }]);
  if (participantError) throw participantError;
  return conversation;
}

export async function participantConversationIds(client: SupabaseClient, staffId: string) {
  const { data, error } = await client.from('recruitment_staff_conversation_participants').select('conversation_id').eq('staff_id', staffId);
  if (error) throw error;
  return (data || []).map((row: { conversation_id: string }) => row.conversation_id);
}
