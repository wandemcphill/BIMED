import type { SupabaseClient } from '@supabase/supabase-js';

// Private bucket - created by the 20260905_interviews.sql migration. Only ever accessed with the
// service-role client (upload here, signed URLs for admin playback), never exposed to anon/authenticated.
export const INTERVIEW_AUDIO_BUCKET = 'interview-recordings';

export type StoredInterviewAnswer = { text: string } | { audio_path: string; mime_type: string };

function extensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'audio';
}

/** Uploads one voice note and returns its storage path. Shared by the first and second interview
 * submission routes - callers pick the folder prefix so the two don't collide. */
export async function uploadVoiceNote(
  client: SupabaseClient,
  folderPrefix: string,
  questionId: string,
  audioBase64: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64');
  const path = `${folderPrefix}/${questionId}-${Date.now()}.${extensionForMime(mimeType)}`;

  const { error } = await client.storage.from(INTERVIEW_AUDIO_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw new Error(`Unable to upload voice note for ${questionId}: ${error.message}`);
  return path;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Short-lived playback URL for an admin viewing a candidate's voice note - the bucket is
 * private, so this is the only way to hear it. */
export async function createSignedAudioUrl(client: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from(INTERVIEW_AUDIO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Converts base64 voice-note answers into stored files before the application row is created,
 * so the applications table only ever holds a lightweight storage path - never raw audio bytes.
 * Typed answers pass through unchanged.
 */
export async function uploadInterviewVoiceNotes(
  client: SupabaseClient,
  tokenHash: string,
  interviewResponses: Record<string, { text?: string; audio_base64?: string; mime_type?: string }>
): Promise<Record<string, StoredInterviewAnswer>> {
  const result: Record<string, StoredInterviewAnswer> = {};

  for (const [questionId, answer] of Object.entries(interviewResponses)) {
    if (answer.audio_base64 && answer.mime_type) {
      const buffer = Buffer.from(answer.audio_base64, 'base64');
      const path = `${tokenHash}/${questionId}-${Date.now()}.${extensionForMime(answer.mime_type)}`;

      const { error } = await client.storage.from(INTERVIEW_AUDIO_BUCKET).upload(path, buffer, {
        contentType: answer.mime_type,
        upsert: false,
      });

      if (error) {
        throw new Error(`Unable to upload voice note for ${questionId}: ${error.message}`);
      }

      result[questionId] = { audio_path: path, mime_type: answer.mime_type };
    } else if (typeof answer.text === 'string') {
      result[questionId] = { text: answer.text };
    }
  }

  return result;
}
