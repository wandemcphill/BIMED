import { recruitmentRoles, recruitmentStatuses } from './recruitment-config';
import { FIRST_INTERVIEW_ALL_QUESTIONS } from './interview-questions';

const FIRST_INTERVIEW_QUESTION_IDS = new Set(FIRST_INTERVIEW_ALL_QUESTIONS.map((q) => q.id));

// A voice note capped at ~90 seconds of opus audio (client-side) is comfortably under 1.5MB
// base64. This bounds per-answer size against abuse while leaving real recordings plenty of room.
const MAX_AUDIO_BASE64_LENGTH = 4_000_000;

export type InterviewAnswer = { text: string } | { audio_base64: string; mime_type: string };

function validateInterviewResponses(value: unknown): Record<string, InterviewAnswer> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('interview_responses must be an object.');
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > FIRST_INTERVIEW_ALL_QUESTIONS.length) {
    throw new Error('interview_responses has too many entries.');
  }

  const result: Record<string, InterviewAnswer> = {};
  for (const [key, raw] of entries) {
    if (!FIRST_INTERVIEW_QUESTION_IDS.has(key)) throw new Error(`Unknown interview question: ${key}`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`interview_responses.${key} is invalid.`);

    const answer = raw as Record<string, unknown>;
    if (typeof answer.audio_base64 === 'string') {
      if (answer.audio_base64.length > MAX_AUDIO_BASE64_LENGTH) throw new Error(`interview_responses.${key} audio is too long.`);
      if (typeof answer.mime_type !== 'string' || !answer.mime_type.startsWith('audio/')) {
        throw new Error(`interview_responses.${key} has an invalid audio type.`);
      }
      result[key] = { audio_base64: answer.audio_base64, mime_type: answer.mime_type };
    } else if (typeof answer.text === 'string') {
      if (answer.text.length > 4000) throw new Error(`interview_responses.${key} is too long.`);
      result[key] = { text: answer.text.trim() };
    } else {
      throw new Error(`interview_responses.${key} is invalid.`);
    }
  }
  return result;
}

export const MAX_JSON_BYTES = {
  candidateApplication: 20 * 1024 * 1024, // raised to fit voice-note interview answers (base64 audio)
  admin: 32 * 1024,
  interview: 16 * 1024,
} as const;

type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes: number,
): Promise<JsonResult<T>> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, error: 'Request body is too large.' };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, error: 'Request body is too large.' };
  }

  if (!raw.trim()) {
    return { ok: false, error: 'Request body is required.' };
  }

  try {
    const value = JSON.parse(raw) as T;
    return { ok: true, data: value };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' };
  }
}

function stringField(body: Record<string, unknown>, key: string, max: number, required = false): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new Error(`${key} is required.`);
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new Error(`${key} is required.`);
  }
  if (trimmed.length > max) {
    throw new Error(`${key} is too long.`);
  }
  return trimmed || null;
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
  return body[key] as boolean;
}

function assertAllowedKeys(body: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unknown.length) {
    throw new Error(`Unexpected field: ${unknown[0]}`);
  }
}

const APPLICATION_KEYS = [
  'token', 'full_name', 'preferred_name', 'email', 'phone', 'date_of_birth', 'nationality',
  'country_of_residence', 'address', 'role_applied', 'employment_type', 'availability',
  'start_date', 'driving_licence', 'vehicle_access', 'care_experience', 'qualifications', 'training',
  'professional_experience', 'employment_history', 'employment_gaps', 'references',
  'living_in_ireland', 'current_country', 'work_permission', 'requires_employment_permit',
  'international_experience', 'relocation_readiness', 'supporting_documents', 'consent',
  'interview_responses',
] as const;

const INTERNATIONAL_FIELDS: Record<string, string> = {
  current_country: 'Current country',
  work_permission: 'Permission to work in Ireland',
  requires_employment_permit: 'Employment permit requirement',
  relocation_readiness: 'Relocation readiness',
};

export function validateCandidateApplication(input: unknown): JsonResult<Record<string, unknown>> {
  if (!isPlainRecord(input)) return { ok: false, error: 'Request body must be a JSON object.' };

  try {
    assertAllowedKeys(input, APPLICATION_KEYS);
    const email = stringField(input, 'email', 254, true)!;
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('email must be a valid email address.');

    const role = stringField(input, 'role_applied', 100, true)!;
    if (!recruitmentRoles.includes(role as (typeof recruitmentRoles)[number])) throw new Error('role_applied is invalid.');

    const living = stringField(input, 'living_in_ireland', 10, true)!;
    if (living !== 'Yes' && living !== 'No') throw new Error('living_in_ireland is invalid.');

    const consent = optionalBoolean(input, 'consent');
    if (consent !== true) throw new Error('consent is required.');

    const supportingDocuments = input.supporting_documents;
    if (!Array.isArray(supportingDocuments)) throw new Error('supporting_documents must be an array.');
    if (supportingDocuments.length > 20 || supportingDocuments.some((item) => typeof item !== 'string' || item.length > 200)) {
      throw new Error('supporting_documents is invalid.');
    }

    const result: Record<string, unknown> = {
      token: stringField(input, 'token', 256, true),
      full_name: stringField(input, 'full_name', 200, true),
      preferred_name: stringField(input, 'preferred_name', 100),
      email,
      phone: stringField(input, 'phone', 40),
      date_of_birth: stringField(input, 'date_of_birth', 10),
      nationality: stringField(input, 'nationality', 100),
      country_of_residence: stringField(input, 'country_of_residence', 100, true),
      address: stringField(input, 'address', 500),
      role_applied: role,
      employment_type: stringField(input, 'employment_type', 100),
      availability: stringField(input, 'availability', 200),
      start_date: stringField(input, 'start_date', 10),
      driving_licence: stringField(input, 'driving_licence', 100),
      vehicle_access: stringField(input, 'vehicle_access', 100),
      care_experience: stringField(input, 'care_experience', 4000),
      qualifications: stringField(input, 'qualifications', 4000),
      training: stringField(input, 'training', 4000),
      professional_experience: stringField(input, 'professional_experience', 5000),
      employment_history: stringField(input, 'employment_history', 5000),
      employment_gaps: stringField(input, 'employment_gaps', 3000),
      references: stringField(input, 'references', 5000),
      living_in_ireland: living,
      current_country: stringField(input, 'current_country', 100),
      work_permission: stringField(input, 'work_permission', 100),
      requires_employment_permit: stringField(input, 'requires_employment_permit', 100),
      international_experience: stringField(input, 'international_experience', 4000),
      relocation_readiness: stringField(input, 'relocation_readiness', 100),
      supporting_documents: supportingDocuments,
      consent: true,
      interview_responses: validateInterviewResponses(input.interview_responses),
    };

    if (living === 'No') {
      for (const [field, label] of Object.entries(INTERNATIONAL_FIELDS)) {
        if (!result[field]) throw new Error(`${label} is required for the international pathway.`);
      }
    }

    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid request.' };
  }
}

export function validateAdminLogin(input: unknown): JsonResult<{ email: string; password: string }> {
  if (!isPlainRecord(input)) return { ok: false, error: 'Request body must be a JSON object.' };
  try {
    assertAllowedKeys(input, ['email', 'password']);
    const email = stringField(input, 'email', 254, true)!;
    const password = stringField(input, 'password', 200, true)!;
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('email must be a valid email address.');
    return { ok: true, data: { email, password } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid request.' };
  }
}

export function validateAdminInvite(input: unknown): JsonResult<{ email: string; name: string | null; role: string | null; expiryDate: string | null }> {
  if (!isPlainRecord(input)) return { ok: false, error: 'Request body must be a JSON object.' };
  try {
    assertAllowedKeys(input, ['email', 'name', 'role', 'expiryDate']);
    const email = stringField(input, 'email', 254, true)!;
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('email must be a valid email address.');
    const expiryDate = stringField(input, 'expiryDate', 40);
    if (expiryDate && Number.isNaN(new Date(expiryDate).getTime())) throw new Error('expiryDate must be a valid date.');
    if (expiryDate && new Date(expiryDate).getTime() <= Date.now()) throw new Error('expiryDate must be in the future.');
    return { ok: true, data: { email, name: stringField(input, 'name', 200), role: stringField(input, 'role', 100), expiryDate } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid request.' };
  }
}

export function validateAdminApplicationPatch(input: unknown): JsonResult<{ status?: string; notes?: string; notify_candidate?: boolean }> {
  if (!isPlainRecord(input)) return { ok: false, error: 'Request body must be a JSON object.' };
  try {
    assertAllowedKeys(input, ['status', 'notes', 'notify_candidate']);
    const status = stringField(input, 'status', 60);
    if (status && !recruitmentStatuses.includes(status as (typeof recruitmentStatuses)[number])) throw new Error('Invalid status value.');
    const notes = stringField(input, 'notes', 10000);
    const notifyCandidate = optionalBoolean(input, 'notify_candidate');
    return { ok: true, data: { ...(status ? { status } : {}), ...(notes !== null ? { notes } : {}), ...(notifyCandidate !== undefined ? { notify_candidate: notifyCandidate } : {}) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid request.' };
  }
}
