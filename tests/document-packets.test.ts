import { describe, expect, it } from 'vitest';
import { PACKETS, packetList } from '@/lib/document-packets';

describe('BIMED document packets', () => {
  it('includes the standard candidate materials while keeping new-starter internal', () => {
    const packets = packetList(false).map((packet) => packet.slug);
    expect(packets).toContain('candidate-application');
    expect(packets).toContain('role-information');
    expect(packets).toContain('supporting-documents');
    expect(packets).toContain('offer-onboarding');
    expect(packets).toContain('care-in-ireland');
    expect(packets).not.toContain('new-starter');
    expect(packets).not.toContain('international-sponsorship');
    expect(packets).not.toContain('welcome-to-ireland');
    expect(packets).not.toContain('international-relocation');
    expect(PACKETS['new-starter'].candidateVisible).toBe(false);
    expect(PACKETS['new-starter'].onboardingEmail).toBe(false);
  });

  it('adds all international-only packets for overseas candidates', () => {
    const packets = packetList(true).map((packet) => packet.slug);
    expect(packets).toContain('international-sponsorship');
    expect(packets).toContain('welcome-to-ireland');
    expect(packets).toContain('international-relocation');
    expect(packets).not.toContain('new-starter');
  });

  it('keeps every registered packet backed by a repository source document', () => {
    for (const packet of Object.values(PACKETS)) expect(packet.sourcePath).toMatch(/^docs\/candidate-packets\//);
  });
});
