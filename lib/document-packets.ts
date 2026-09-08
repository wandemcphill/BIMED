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

export const PACKETS: Record<PacketSlug, { title: string; description: string; internationalOnly?: boolean; sourcePath?: string }> = {
  'candidate-application': { title: 'Candidate Application Guide', description: 'How to complete the private application and provide requested evidence.', sourcePath: 'docs/candidate-packets/03-candidate-application-guide.md' },
  'role-information': { title: 'Role Information Pack', description: 'Candidate-facing role, expectations and recruitment information.', sourcePath: 'docs/candidate-packets/01-role-information-pack.md' },
  'supporting-documents': { title: 'Supporting Documents Checklist', description: 'Checklist of documents and evidence requested during recruitment.', sourcePath: 'docs/candidate-packets/10-supporting-documents-checklist.md' },
  'international-sponsorship': { title: 'International Recruitment & Visa Sponsorship Pack', description: 'Overseas recruitment, work-permission and sponsorship checklist.', internationalOnly: true, sourcePath: 'docs/candidate-packets/04-visa-sponsorship-application-pack.md' },
  'offer-onboarding': { title: 'Offer & Onboarding Guide', description: 'What happens after selection, including contract, induction and next steps.', sourcePath: 'docs/candidate-packets/12-offer-onboarding-guide.md' },
  'welcome-to-ireland': { title: 'Welcome to Ireland Pack', description: 'Practical pre-arrival, arrival and first-weeks orientation for international hires.', internationalOnly: true, sourcePath: 'docs/candidate-packets/06-welcome-to-ireland-pack.md' },
  'care-in-ireland': { title: 'Care in Ireland Handbook', description: 'BIMED orientation for safe, person-centred care practice in Ireland.', sourcePath: 'docs/candidate-packets/07-care-in-ireland-handbook.md' },
  'international-relocation': { title: 'International Relocation & First-Month Checklist', description: 'Offer-to-arrival operational checklist for overseas hires.', internationalOnly: true, sourcePath: 'docs/candidate-packets/08-international-relocation-checklist.md' },
  'new-starter': { title: 'New Starter Onboarding Checklist', description: 'BIMED day-one, week-one and first-month onboarding checklist.', sourcePath: 'docs/candidate-packets/09-new-starter-onboarding-checklist.md' },
};

export function packetList(international: boolean) {
  return (Object.entries(PACKETS) as Array<[PacketSlug, typeof PACKETS[PacketSlug]]>)
    .filter(([, p]) => !p.internationalOnly || international)
    .map(([slug, packet]) => ({ slug, ...packet }));
}

export async function createPacketAccess(applicationId: string, packetSlug: PacketSlug, createdBy: string, ttlDays = 30) {
  const packet = PACKETS[packetSlug];
  if (!packet) throw new Error('Unknown document packet.');
  const token = makeToken();
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  const { data, error } = await db().from('recruitment_document_packet_access').insert({
    application_id: applicationId,
    packet_slug: packetSlug,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_by: createdBy,
  }).select('id, application_id, packet_slug, expires_at, created_at').single();
  if (error || !data) throw new Error(error?.message || 'Unable to create document packet access.');
  return { record: data, token, url: `${getAppUrl()}/candidate/packet/${token}` };
}

export async function getPacketAccess(token: string) {
  const client = db();
  const { data, error } = await client.from('recruitment_document_packet_access')
    .select('id, application_id, packet_slug, expires_at, revoked_at, viewed_at')
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
