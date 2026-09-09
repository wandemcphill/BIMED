import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { getAppUrl, sendRecruitmentInviteEmail, type SendResult } from '@/lib/email';
import { normalizeRecruitmentRole } from '@/lib/bimed-role-policy';

export type InviteInput = {
  email: string;
  name: string | null;
  role: string | null;
  expiryDate: string | null;
};

function formatExpiry(expiryDate: string | null): string | null {
  if (!expiryDate) return null;
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

// Creates the invite row and immediately emails the private application link to the candidate.
// Both single and bulk invitations pass through this function, so role normalization happens once.
export async function createAndSendInvite(
  input: InviteInput,
  actor: string,
  client?: SupabaseClient
): Promise<{ invite: Record<string, unknown>; link: string; email: SendResult }> {
  const supabase = client || db();
  const canonicalRole = normalizeRecruitmentRole(input.role);
  if (!canonicalRole) throw new Error('Invalid recruitment role.');

  const token = makeToken();

  const { data: invite, error } = await supabase
    .from('recruitment_invites')
    .insert({
      token_hash: hashToken(token),
      candidate_email: input.email,
      candidate_name: input.name,
      role: canonicalRole,
      expires_at: input.expiryDate,
    })
    .select('*')
    .single();

  if (error || !invite) {
    throw new Error(error?.message || 'Unable to create invitation.');
  }

  const link = `${getAppUrl()}/apply/${token}`;

  await recordRecruitmentAudit(supabase, {
    inviteId: invite.id,
    eventType: 'invite_created',
    actor,
    metadata: { candidate_email: input.email, role: canonicalRole, expires_at: input.expiryDate },
  });

  const email = await sendRecruitmentInviteEmail(
    {
      inviteId: invite.id,
      candidateEmail: input.email,
      candidateName: input.name,
      role: canonicalRole,
      applyUrl: link,
      expiresLabel: formatExpiry(input.expiryDate),
    },
    supabase
  );

  return { invite, link, email };
}
