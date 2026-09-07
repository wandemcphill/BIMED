import { describe, expect, it } from 'vitest';
import { isInternationalCandidate, supportingDocumentsEmail, recruitmentContacts } from '@/lib/recruitment-config';
import { validateCandidateApplication } from '@/lib/request-validation';

describe('international pathway', () => {
  const completeInternational = {
    living_in_ireland: 'No',
    country_of_residence: 'Nigeria',
    current_country: 'Nigeria',
    work_permission: 'No',
    requires_employment_permit: 'Yes',
    relocation_readiness: 'Ready to relocate',
  };

  it('does not classify an incomplete pathway as complete', () => {
    expect(isInternationalCandidate({ living_in_ireland: 'No' })).toBe(false);
    expect(isInternationalCandidate({ ...completeInternational, relocation_readiness: '' })).toBe(false);
  });

  it('classifies a completed international pathway as complete', () => {
    expect(isInternationalCandidate(completeInternational)).toBe(true);
  });

  it('routes international supporting documents from the living-in-Ireland answer', () => {
    expect(supportingDocumentsEmail({ living_in_ireland: 'No' })).toBe(recruitmentContacts.overseas);
    expect(supportingDocumentsEmail({ living_in_ireland: 'Yes' })).toBe(recruitmentContacts.ireland);
  });

  it('reports the exact missing international field', () => {
    const result = validateCandidateApplication({
      token: 'abc',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      country_of_residence: 'Nigeria',
      role_applied: 'Healthcare Assistant',
      living_in_ireland: 'No',
      current_country: 'Nigeria',
      work_permission: 'No',
      requires_employment_permit: 'Yes',
      supporting_documents: [],
      consent: true,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Relocation readiness is required for the international pathway.',
    });
  });
});
