import type { SupabaseClient } from '@supabase/supabase-js';
import { isInternationalRoutingCandidate } from './recruitment-config';

export type OnboardingChecklistStatus = 'pending' | 'completed' | 'waived';

export type OnboardingChecklistItem = {
  item_key: string;
  title: string;
  description: string;
  required: boolean;
  status?: OnboardingChecklistStatus;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
};

export const ONBOARDING_CHECKLIST_BASE: Omit<OnboardingChecklistItem, 'status' | 'completed_at' | 'completed_by' | 'notes'>[] = [
  {
    item_key: 'identity_verified',
    title: 'Identity verified',
    description: 'Passport or other identity evidence has been reviewed and verified.',
    required: true,
  },
  {
    item_key: 'qualification_evidence_verified',
    title: 'Qualification evidence verified',
    description: 'Required qualification and training evidence has been reviewed for the applied role.',
    required: true,
  },
  {
    item_key: 'references_verified',
    title: 'References verified',
    description: 'Required professional or employment references have been checked and accepted.',
    required: true,
  },
  {
    item_key: 'right_to_work_verified',
    title: 'Right to work verified',
    description: 'The candidate has been cleared to work in Ireland under the applicable pathway.',
    required: true,
  },
];

export const INTERNATIONAL_ONBOARDING_CHECKLIST: Omit<OnboardingChecklistItem, 'status' | 'completed_at' | 'completed_by' | 'notes'> = {
  item_key: 'international_work_permission_verified',
  title: 'International work permission verified',
  description: 'Required employment-permit or sponsorship evidence has been reviewed and accepted for this overseas candidate.',
  required: true,
};

export function onboardingChecklistForApplication(application: {
  living_in_ireland?: string | null;
}): Omit<OnboardingChecklistItem, 'status' | 'completed_at' | 'completed_by' | 'notes'>[] {
  const items = [...ONBOARDING_CHECKLIST_BASE];
  if (isInternationalRoutingCandidate(application)) items.push(INTERNATIONAL_ONBOARDING_CHECKLIST);
  return items;
}

export async function ensureOnboardingChecklist(
  client: SupabaseClient,
  application: { id: string; living_in_ireland?: string | null },
) {
  const rows = onboardingChecklistForApplication(application).map((item) => ({
    application_id: application.id,
    ...item,
  }));

  const { error } = await client
    .from('recruitment_onboarding_checklist')
    .upsert(rows, { onConflict: 'application_id,item_key', ignoreDuplicates: true });
  if (error) throw error;
}

export async function getOnboardingReadiness(
  client: SupabaseClient,
  application: { id: string; living_in_ireland?: string | null },
) {
  await ensureOnboardingChecklist(client, application);
  const { data, error } = await client
    .from('recruitment_onboarding_checklist')
    .select('id, application_id, item_key, title, description, required, status, completed_at, completed_by, notes, created_at, updated_at')
    .eq('application_id', application.id)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const items = (data || []) as OnboardingChecklistItem[];
  const required = items.filter((item) => item.required);
  const incomplete = required.filter((item) => item.status !== 'completed' && item.status !== 'waived');
  return {
    ready: incomplete.length === 0,
    items,
    missing: incomplete.map((item) => ({ item_key: item.item_key, title: item.title })),
  };
}
