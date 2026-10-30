export type InterviewAudioDraftAnswer = {
  audio_base64: string;
  mime_type: string;
};

type InterviewDraftResponse = {
  audio_base64?: string;
  mime_type?: string;
  text?: string;
};

const DATABASE_NAME = 'bimed-candidate-drafts';
const DATABASE_VERSION = 1;
const AUDIO_STORE_NAME = 'interview-audio';

function openDraftDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Browser draft storage is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        database.createObjectStore(AUDIO_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open browser draft storage.'));
    request.onblocked = () => reject(new Error('Browser draft storage is blocked by another open tab.'));
  });
}

/** Keep large voice payloads out of localStorage while preserving them between visits. */
export function extractInterviewAudioDraft(
  responses: Record<string, InterviewDraftResponse>
): Record<string, InterviewAudioDraftAnswer> {
  return Object.fromEntries(
    Object.entries(responses)
      .filter(([, answer]) => Boolean(
        answer
        && typeof answer.audio_base64 === 'string'
        && answer.audio_base64.length > 0
        && typeof answer.mime_type === 'string'
        && answer.mime_type.startsWith('audio/')
      ))
      .map(([questionId, answer]) => [
        questionId,
        { audio_base64: answer.audio_base64!, mime_type: answer.mime_type! },
      ])
  );
}

export function mergeInterviewAudioDraft(
  responses: Record<string, InterviewDraftResponse>,
  audioDraft: Record<string, InterviewAudioDraftAnswer>
): Record<string, InterviewDraftResponse> {
  return { ...responses, ...audioDraft };
}

function normalizeStoredAudioDraft(value: unknown): Record<string, InterviewAudioDraftAnswer> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, answer]) => {
        if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
        const candidate = answer as Record<string, unknown>;
        return typeof candidate.audio_base64 === 'string'
          && candidate.audio_base64.length > 0
          && typeof candidate.mime_type === 'string'
          && candidate.mime_type.startsWith('audio/');
      })
      .map(([questionId, answer]) => {
        const candidate = answer as Record<string, string>;
        return [questionId, {
          audio_base64: candidate.audio_base64,
          mime_type: candidate.mime_type,
        }];
      })
  );
}

export async function loadInterviewAudioDraft(
  token: string
): Promise<Record<string, InterviewAudioDraftAnswer>> {
  const database = await openDraftDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, 'readonly');
      const request = transaction.objectStore(AUDIO_STORE_NAME).get(token);
      let storedValue: unknown;

      request.onsuccess = () => {
        storedValue = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('Unable to read saved voice answers.'));
      transaction.oncomplete = () => resolve(normalizeStoredAudioDraft(storedValue));
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to read saved voice answers.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Reading saved voice answers was interrupted.'));
    });
  } finally {
    database.close();
  }
}

export async function saveInterviewAudioDraft(
  token: string,
  responses: Record<string, InterviewDraftResponse>
): Promise<void> {
  const database = await openDraftDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(AUDIO_STORE_NAME);
      const audioDraft = extractInterviewAudioDraft(responses);

      if (Object.keys(audioDraft).length) {
        store.put(audioDraft, token);
      } else {
        store.delete(token);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save voice answers.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving voice answers was interrupted.'));
    });
  } finally {
    database.close();
  }
}

export async function clearInterviewAudioDraft(token: string): Promise<void> {
  await saveInterviewAudioDraft(token, {});
}
