import { describe, expect, it } from 'vitest';
import { databaseInviteError } from '@/app/api/applications/route';

/**
 * In production, a second submission against a used invitation returned a generic
 * HTTP 500 instead of the intended 409 INVITATION_USED. databaseInviteError checked
 * `error instanceof Error`, but Supabase RPC errors from create_recruitment_application
 * come back from supabase-js as plain PostgrestError objects -- { code, message, details,
 * hint } -- never JS Error instances. The check never matched, so every invitation-state
 * error (used, expired, not found) fell through to the generic 500 branch.
 *
 * The invitation itself was never double-consumed -- that is enforced by the database's
 * row lock, confirmed separately -- this bug was purely in how the API surfaced the
 * failure to the client.
 */

function postgrestError(message: string) {
  return { code: 'P0001', details: null, hint: null, message };
}

describe('databaseInviteError', () => {
  it('maps the real production error shape for a used invitation', () => {
    // Exactly what a live create_recruitment_application call returned in production.
    expect(databaseInviteError(postgrestError('INVITATION_USED'))).toEqual({
      error: 'This invitation has already been used.',
      status: 409,
    });
  });

  it('maps an expired invitation', () => {
    expect(databaseInviteError(postgrestError('INVITATION_EXPIRED'))).toEqual({
      error: 'This invitation has expired.',
      status: 410,
    });
  });

  it('maps an invitation that does not exist', () => {
    expect(databaseInviteError(postgrestError('INVITATION_NOT_FOUND'))).toEqual({
      error: 'Invitation not found.',
      status: 404,
    });
  });

  it('still recognises a real JS Error instance', () => {
    expect(databaseInviteError(new Error('INVITATION_USED'))?.status).toBe(409);
  });

  it('returns null for an unrelated database error, so it falls through to the generic 500', () => {
    expect(databaseInviteError(postgrestError('duplicate key value violates unique constraint'))).toBeNull();
    expect(databaseInviteError(new Error('connection reset'))).toBeNull();
    expect(databaseInviteError(null)).toBeNull();
    expect(databaseInviteError(undefined)).toBeNull();
  });
});
