import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activationExpiresAt, createActivationToken, hashActivationToken } from './staff-auth';

export const STAFF_PHOTO_BUCKET = 'bimed-staff-photos';

export type StaffStatus = 'pre_arrival' | 'active' | 'on_leave' | 'suspended' | 'former';

export async function createStaffFromApplication(client: SupabaseClient, applicationId: string) {
  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('*')
    .eq('id', applicationId)
    .single();
  if (applicationError || !application) throw new Error('Application not found.');

  const { data: existing } = await client
    .from('recruitment_staff')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (existing) return { staff: existing, activationToken: null as string | null };

  const activationToken = createActivationToken();
  const { data: staff, error } = await client
    .from('recruitment_staff')
    .insert({
      application_id: application.id,
      full_name: application.full_name,
      preferred_name: application.preferred_name,
      email: application.email.trim().toLowerCase(),
      phone: application.phone,
      date_of_birth: application.date_of_birth,
      nationality: application.nationality,
      role: application.role_applied,
      employment_type: application.employment_type,
      employment_start_date: application.start_date,
      country: 'Ireland',
      status: application.living_in_ireland === 'No' ? 'pre_arrival' : 'active',
      activation_token_hash: hashActivationToken(activationToken),
      activation_expires_at: activationExpiresAt(),
    })
    .select('*')
    .single();
  if (error || !staff) throw error || new Error('Unable to create staff profile.');

  return { staff, activationToken };
}

export async function createStaffNotification(
  client: SupabaseClient,
  input: { staffId: string; category: string; title: string; body: string; actionUrl?: string | null },
) {
  const { data, error } = await client
    .from('recruitment_staff_notifications')
    .insert({
      staff_id: input.staffId,
      category: input.category,
      title: input.title,
      body: input.body,
      action_url: input.actionUrl || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function createStaffAudit(
  client: SupabaseClient,
  input: { staffId?: string | null; actor: string; eventType: string; metadata?: Record<string, unknown> },
) {
  await client.from('recruitment_staff_audit_log').insert({
    staff_id: input.staffId || null,
    actor: input.actor,
    event_type: input.eventType,
    metadata: input.metadata || {},
  });
}

export function hashOneTimePhotoName(staffId: string, originalName: string) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${staffId}/${crypto.createHash('sha256').update(`${staffId}:${safe}`).digest('hex').slice(0, 16)}-${Date.now()}-${safe}`;
}
