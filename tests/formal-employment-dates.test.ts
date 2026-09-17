import { describe, expect, it } from 'vitest';
import {
  BIMED_DEFAULT_END_DATE_ISO,
  BIMED_DEFAULT_START_DATE,
  BIMED_DEFAULT_START_DATE_ISO,
  BIMED_DEFAULT_CONTRACT_DURATION,
} from '@/lib/bimed-role-policy';

describe('BIMED formal employment dates', () => {
  it('uses one canonical contractual commencement date', () => {
    expect(BIMED_DEFAULT_START_DATE_ISO).toBe('2027-01-11');
    expect(BIMED_DEFAULT_START_DATE).toBe('11 January 2027');
  });

  it('uses one canonical fixed-term end date', () => {
    expect(BIMED_DEFAULT_END_DATE_ISO).toBe('2029-01-10');
    expect(BIMED_DEFAULT_CONTRACT_DURATION).toContain('11 January 2027 to 10 January 2029');
  });
});
