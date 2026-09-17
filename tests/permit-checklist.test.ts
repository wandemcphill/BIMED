import { describe, expect, it } from 'vitest';
import {
  getPermitChecklist,
  DETE_CSEP_CHECKLIST_URL,
  DETE_GENERAL_EMPLOYMENT_PERMIT_CHECKLIST_URL,
  DETE_HCA_EMPLOYMENT_PERMIT_CHECKLIST_URL,
} from '@/lib/permit-checklist';

describe('role-specific employment permit checklist', () => {
  it('uses the CSEP checklist for physiotherapists and includes CORU readiness', () => {
    const checklist = getPermitChecklist('Physiotherapist', 'bimed_legal_team');
    expect(checklist?.permit_type).toBe('critical_skills_employment_permit');
    expect(checklist?.source_url).toBe(DETE_CSEP_CHECKLIST_URL);
    expect(checklist?.items.some((item) => item.id === 'coru-registration')).toBe(true);
    expect(checklist?.items.find((item) => item.id === 'permit-payment')?.audience).toBe('BIMED');
    expect(checklist?.items.find((item) => item.id === 'csep-no-lmnt')?.detail).toContain('No Labour Market Needs Test');
  });

  it('uses the dedicated HCA checklist and includes HCA-specific preparation', () => {
    const checklist = getPermitChecklist('Healthcare Assistant', 'candidate_or_agency');
    expect(checklist?.permit_type).toBe('general_employment_permit');
    expect(checklist?.source_url).toBe(DETE_HCA_EMPLOYMENT_PERMIT_CHECKLIST_URL);
    expect(checklist?.items.some((item) => item.id === 'hca-role-evidence')).toBe(true);
    expect(checklist?.items.some((item) => item.id === 'hca-renewal-note')).toBe(true);
    expect(checklist?.items.find((item) => item.id === 'permit-payment')?.audience).toBe('candidate');
  });

  it('uses the standard GEP checklist for Support Worker and Senior Support Worker', () => {
    for (const role of ['Support Worker', 'Senior Support Worker']) {
      const checklist = getPermitChecklist(role, null);
      expect(checklist?.permit_type).toBe('general_employment_permit');
      expect(checklist?.source_url).toBe(DETE_GENERAL_EMPLOYMENT_PERMIT_CHECKLIST_URL);
      expect(checklist?.items.some((item) => item.id === 'lmnt')).toBe(true);
      expect(checklist?.items.some((item) => item.id === 'care-role-evidence')).toBe(true);
      expect(checklist?.submission_route_label).toBe('Choose submission route');
    }
  });

  it('returns null for an unsupported role instead of inventing a checklist', () => {
    expect(getPermitChecklist('Chef', 'candidate_or_agency')).toBeNull();
  });
});
