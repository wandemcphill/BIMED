import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getAppUrl } from '@/lib/email';

export type SecondInterviewAnswer = string | { audio_path: string; mime_type: string };

export type SecondInterviewRecord = {
  id: string;
  application_id: string;
  status: 'sent' | 'completed';
  answers: Record<string, SecondInterviewAnswer> | null;
  sent_by: string;
  sent_at: string;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
};

const SECOND_INTERVIEW_LINK_TTL_DAYS = 14;

export function secondInterviewUrl(token: string): string {
  return `${getAppUrl()}/second-interview/${token}`;
}

export async function createSecondInterviewRequest(input: {
  applicationId: string;
  sentBy: string;
}): Promise<{ record: SecondInterviewRecord; token: string; link: string }> {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + SECOND_INTERVIEW_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db()
    .from('recruitment_second_interviews')
    .insert({
      application_id: input.applicationId,
      token_hash: hashToken(token),
      sent_by: input.sentBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to create second interview request.');
  }

  return { record: data as SecondInterviewRecord, token, link: secondInterviewUrl(token) };
}

export async function getSecondInterviewByToken(token: string): Promise<SecondInterviewRecord | null> {
  const { data, error } = await db()
    .from('recruitment_second_interviews')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  return data as SecondInterviewRecord;
}

export async function listSecondInterviewsForApplication(applicationId: string): Promise<SecondInterviewRecord[]> {
  const { data, error } = await db()
    .from('recruitment_second_interviews')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as SecondInterviewRecord[];
}

export async function completeSecondInterview(
  id: string,
  answers: Record<string, SecondInterviewAnswer>
): Promise<SecondInterviewRecord | null> {
  const { data, error } = await db()
    .from('recruitment_second_interviews')
    .update({ status: 'completed', answers, completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'sent')
    .select('*')
    .maybeSingle();

  if (error || !data) return null;
  return data as SecondInterviewRecord;
}
