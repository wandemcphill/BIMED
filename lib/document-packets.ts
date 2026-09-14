import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getAppUrl } from '@/lib/email';

export type PacketSlug =
  | 'candidate-application'
  | 'role-information'
  | 'supporting-documents'
  | 'international-sponsorship'
  | 'offer-onboarding'
  | 'welcome-to-ireland'
  | 'care-in-ireland'
  | 'international-relocation'
  | 'new-starter';

export type PacketMode = 'reading' | 'acknowledgement' | 'checklist' | 'form';

export type PacketDefinition = {
  title: string;
  description: string;
  internationalOnly?: boolean;
  candidateVisible: boolean;
  mode: PacketMode;
  onboardingEmail?: boolean;
  sourcePath?: string;
};

export const PACKETS: Record<PacketSlug, PacketDefinition> = {
  'candidate-application': {
    title: 'Candidate Application Guide',
    description: 'How to complete the private application and prepare requested evidence.',
    candidateVisible: true,
    mode: 'reading',
    onboardingEmail: false,
    sourcePath: 'docs/candidate-packets/03-candidate-application-guide.md',
  },
  'role-information': {
    title: 'Role Information Pack',
    description: 'Your role, expectations and recruitment information.',
    candidateVisible: true,
    mode: 'acknowledgement',
    onboardingEmail: false,
    sourcePath: 'docs/candidate-packets/01-role-information-pack.md',
  },
  'supporting-documents': {
    title: 'Supporting Documents Checklist',
    description: 'A candidate-facing checklist of evidence BIMED has requested from you.',
    candidateVisible: true,
    mode: 'checklist',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/10-supporting-documents-checklist.md',
  },
  'international-sponsorship': {
    title: 'International Recruitment & Visa Sponsorship Pack',
    description: 'Complete your overseas recruitment and work-permission information securely.',
    internationalOnly: true,
    candidateVisible: true,
    mode: 'form',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/04-visa-sponsorship-application-pack.md',
  },
  'offer-onboarding': {
    title: 'Offer & Onboarding Guide',
    description: 'What happens after selection, contract signing and before your first day.',
    candidateVisible: true,
    mode: 'acknowledgement',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/12-offer-onboarding-guide.md',
  },
  'welcome-to-ireland': {
    title: 'Welcome to Ireland Pack',
    description: 'Arrival planning and practical first-days guidance for international hires.',
    internationalOnly: true,
    candidateVisible: true,
    mode: 'form',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/06-welcome-to-ireland-pack.md',
  },
  'care-in-ireland': {
    title: 'Care in Ireland Handbook',
    description: 'BIMED orientation for safe, person-centred care practice in Ireland.',
    candidateVisible: true,
    mode: 'acknowledgement',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/07-care-in-ireland-handbook.md',
  },
  'international-relocation': {
    title: 'International Relocation & First-Month Checklist',
    description: 'Your offer-to-arrival checklist for an overseas move to Ireland.',
    internationalOnly: true,
    candidateVisible: true,
    mode: 'checklist',
    onboardingEmail: true,
    sourcePath: 'docs/candidate-packets/08-international-relocation-checklist.md',
  },
  'new-starter': {
    title: 'New Starter Onboarding Checklist',
    description: 'Internal BIMED onboarding control checklist for managers and HR.',
    candidateVisible: false,
    mode: 'checklist',
    onboardingEmail: false,
    sourcePath: 'docs/candidate-packets/09-new-starter-onboarding-checklist.md',
  },
};

export function packetList(international: boolean) {
  return (Object.entries(PACKETS) as Array<[PacketSlug, PacketDefinition]>)
    .filter(([, packet]) => packet.candidateVisible && (!packet.internationalOnly || international))
    .map(([slug, packet]) => ({ slug, ...packet }));
}

export function getPacketDefinition(slug: string | null | undefined) {
  if (!slug) return null;
  return PACKETS[slug as PacketSlug] ?? null;
}

export async function createPacketAccess(applicationId: string, packetSlug: PacketSlug, createdBy: string, ttlDays = 30) {
  const packet = PACKETS[packetSlug];
  if (!packet) throw new Error('Unknown document packet.');
  if (!packet.candidateVisible) throw new Error('This document is internal and cannot be issued to a candidate.');
  const token = makeToken();
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  const { data, error } = await db().from('recruitment_document_packet_access').insert({
    application_id: applicationId,
    packet_slug: packetSlug,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_by: createdBy,
  }).select('id, application_id, packet_slug, expires_at, created_at, response_data, last_saved_at, completed_at').single();
  if (error || !data) throw new Error(error?.message || 'Unable to create document packet access.');
  return { record: data, token, url: `${getAppUrl()}/candidate/packet/${token}` };
}

export async function getPacketAccess(token: string) {
  const client = db();
  const { data, error } = await client.from('recruitment_document_packet_access')
    .select('id, application_id, packet_slug, expires_at, revoked_at, viewed_at, response_data, last_saved_at, completed_at')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;

  if (!data.viewed_at) {
    const viewedAt = new Date().toISOString();
    await client.from('recruitment_document_packet_access')
      .update({ viewed_at: viewedAt })
      .eq('id', data.id).is('viewed_at', null);
    return { ...data, viewed_at: viewedAt };
  }
  return data;
}
