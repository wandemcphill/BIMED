import { describe, expect, it } from 'vitest';
import {
  MAX_JSON_BYTES,
  validateAdminApplicationPatch,
  validateAdminInvite,
  validateAdminLogin,
  validateCandidateApplication,
} from '@/lib/request-validation';

describe('request validation', () => {
  it('allows the configured candidate submission limit required for voice-note answers', () => {
    expect(MAX_JSON_BYTES.candidateApplication).toBe(20 * 1024 * 1024);
  });

  it('accepts a valid Ireland candidate payload', () => {
    const result = validateCandidateApplication({
      token: 'abc', full_name: 'Jane Doe', preferred_name: 'Jane', email: 'jane@example.com',
      country_of_residence: 'Ireland', role_applied: 'Healthcare Assistant', living_in_ireland: 'Yes',
      supporting_documents: ['Passport / identity document'], consent: true,
    });
    expect(result.ok).toBe(true);
  });

  it('requires international pathway fields', () => {
    const result = validateCandidateApplication({
      token: 'abc', full_name: 'Jane Doe', email: 'jane@example.com',
      country_of_residence: 'Nigeria', role_applied: 'Healthcare Assistant', living_in_ireland: 'No',
      supporting_documents: [], consent: true,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects unexpected candidate fields', () => {
    const result = validateCandidateApplication({
      token: 'abc', full_name: 'Jane Doe', email: 'jane@example.com', country_of_residence: 'Ireland',
      role_applied: 'Healthcare Assistant', living_in_ireland: 'Yes', supporting_documents: [], consent: true,
      password: 'unexpected',
    });
    expect(result.ok).toBe(false);
  });

  it('validates admin login payloads', () => {
    expect(validateAdminLogin({ email: 'admin@example.com', password: 'LongEnoughPassword1' }).ok).toBe(true);
    expect(validateAdminLogin({ email: 'not-an-email', password: 'LongEnoughPassword1' }).ok).toBe(false);
  });

  it('validates admin invitations', () => {
    expect(validateAdminInvite({ email: 'candidate@example.com', name: 'Candidate', role: 'Healthcare Assistant', expiryDate: '2099-01-01T00:00:00.000Z' }).ok).toBe(true);
    expect(validateAdminInvite({ email: 'candidate@example.com', expiryDate: '2000-01-01T00:00:00.000Z' }).ok).toBe(false);
  });

  it('validates application status updates', () => {
    expect(validateAdminApplicationPatch({ status: 'Interview', notes: 'Ready', notify_candidate: true }).ok).toBe(true);
    expect(validateAdminApplicationPatch({ status: 'not-a-real-status' }).ok).toBe(false);
  });
});
