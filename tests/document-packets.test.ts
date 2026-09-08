import { describe, expect, it } from 'vitest';
import { PACKETS, packetList } from '@/lib/document-packets';

describe('BIMED document packets', () => {
  it('includes the standard recruitment and onboarding packets for Ireland-based candidates', () => {
    const packets = packetList(false).map((packet) => packet.slug);
    expect(packets).toEqual(expect.arrayContaining([
      'candidate-application',
      'offer-onboarding',
      'care-in-ireland',
      'new-starter',
    ]));
    expect(packets).not.toContain('international-sponsorship');
    expect(packets).not.toContain('welcome-to-ireland');
    expect(packets).not.toContain('international-relocation');
  });

  it('adds every international-only packet for overseas candidates', () => {
    const packets = packetList(true).map((packet) => packet.slug);
    expect(packets).toEqual(expect.arrayContaining([
      'international-sponsorship',
      'welcome-to-ireland',
      'international-relocation',
    ]));
  });

  it('keeps every registered packet backed by a repository source document', () => {
    for (const packet of Object.values(PACKETS)) {
      expect(packet.sourcePath).toMatch(/^docs\/candidate-packets\//);
    }
  });

  it('keeps packet slugs stable and unique', () => {
    const slugs = Object.keys(PACKETS);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(expect.arrayContaining([
      'candidate-application',
      'international-sponsorship',
      'offer-onboarding',
      'welcome-to-ireland',
      'care-in-ireland',
      'international-relocation',
      'new-starter',
    ]));
  });
});
