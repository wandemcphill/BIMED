import type { SupabaseClient } from '@supabase/supabase-js';

type AuditEvent = {
  applicationId?: string | null;
  inviteId?: string | null;
  eventType: string;
  actor: string;
  metadata?: Record<string, unknown>;
};

export async function recordRecruitmentAudit(client: SupabaseClient, event: AuditEvent) {
  const { error } = await client.from('recruitment_audit_log').insert({
    application_id: event.applicationId || null,
    invite_id: event.inviteId || null,
    event_type: event.eventType,
    actor: event.actor,
    metadata: event.metadata || {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to write recruitment audit log', error);
  }
}
