import type { NextRequest } from 'next/server';
import { recruitmentRoles, recruitmentStatuses } from '@/lib/recruitment-config';

export const MAX_REQUEST_BYTES = 64 * 1024;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export async function readJsonBody(request: NextRequest, maxBytes = MAX_REQUEST_BYTES): Promise<ValidationResult<Record<string, unknown>>> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, error: 'Request payload is too large.' };
    }
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > maxBytes) {
      return { ok: false, error: 'Request payload is too large.' };
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Request body must be a JSON object.' };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Request body must contain valid JSON.' };
  }
}

function stringValue(value: unknown, field: string, max: number, required = false): ValidationResult<string | null> {
  if (value === undefined || value === null || value === '') {
    return required ? { ok: false, error: `${field} is required.` } : { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string.` };
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    return { ok: false, error: `${field} is required.` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${field} is too long.` };
  }
  return { ok: true, value: trimmed || null };
}

function emailValue(value: unknown, required = true): ValidationResult<string | null> {
  const result = stringValue(value, 'Email address', 254, required);
  if (!result.ok || !result.value) return result;
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(result.value)) {
    return { ok: false, error: 'Email address is invalid.' };
  }
  return { ok: true, value: result.value.toLowerCase() };
}

function dateValue(value: unknown, field: string): ValidationResult<string | null> {
  const result = stringValue(value, field, 10);
  if (!result.ok || !result.value) return result;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.value) || Number.isNaN(new Date(`${result.value}T00:00:00Z`).getTime())) {
    return { ok: false, error: `${field} must be a valid date.` };
  }
  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, field: string, allowed: T, required = false): ValidationResult<T[number] | null> {
  const result = stringValue(value, field, 100, required);
  if (!result.ok || !result.value) return result as ValidationResult<T[number] | null>;
  if (!allowed.includes(result.value)) {
    return { ok: false, error: `${field} has an invalid value.` };
  }
  return { ok: true, value: result.value as T[number] };
}

function boolValue(value: unknown, field: string, required = false): ValidationResult<boolean | null> {
  if (value === undefined || value === null) return required ? { ok: false, error: `${field} is required.` } : { ok: true, value: null };
  if (typeof value !== 'boolean') return { ok: false, error: `${field} must be true or false.` };
  return { ok: true, value };
}

function collectField<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export type CandidateApplicationInput = Record<string, unknown> & {
  full_name: string;
  email: string;
  country_of_residence: string;
  role_applied: string;
  living_in_ireland: string;
  consent: true;
};

export function validateCandidateApplication(body: Record<string, unknown>): ValidationResult<CandidateApplicationInput> {
  try {
    const full_name = collectField(stringValue(body.full_name, 'Full name', 160, true));
    const email = collectField(emailValue(body.email, true));
    const country_of_residence = collectField(stringValue(body.country_of_residence, 'Country of residence', 120, true));
    const role_applied = collectField(enumValue(body.role_applied, 'Role applied', recruitmentRoles, true));
    const living_in_ireland = collectField(enumValue(body.living_in_ireland, 'Living in Ireland', ['Yes', 'No'] as const, true));
    const consent = collectField(boolValue(body.consent, 'Consent', true));
    if (!consent) return { ok: false, error: 'Consent is required.' };

    const fields: Record<string, unknown> = {
      full_name,
      email,
      country_of_residence,
      role_applied,
      living_in_ireland,
      consent: true,
    };

    const stringFields: Array<[string, number]> = [
      ['preferred_name', 160], ['phone', 40], ['nationality', 120], ['address', 500],
      ['employment_type', 100], ['availability', 200], ['driving_licence', 100], ['vehicle_access', 100],
      ['care_experience', 4000], ['qualifications', 4000], ['training', 4000], ['professional_experience', 8000],
      ['employment_history', 12000], ['employment_gaps', 4000], ['references', 8000], ['current_country', 120],
      ['work_permission', 200], ['requires_employment_permit', 200], ['international_experience', 4000], ['relocation_readiness', 1000],
    ];

    for (const [field, max] of stringFields) {
      const result = stringValue(body[field], field.replace(/_/g, ' '), max);
      if (!result.ok) return result;
      if (result.value !== null) fields[field] = result.value;
    }

    for (const field of ['date_of_birth', 'start_date'] as const) {
      const result = dateValue(body[field], field.replace(/_/g, ' '));
      if (!result.ok) return result;
      if (result.value !== null) fields[field] = result.value;
    }

    const docs = body.supporting_documents;
    if (docs !== undefined) {
      if (!Array.isArray(docs) || docs.length > 20 || docs.some((item) => typeof item !== 'string' || item.length > 300)) {
        return { ok: false, error: 'Supporting document list is invalid.' };
      }
      fields.supporting_documents = docs.map((item) => item.trim());
    } else {
      fields.supporting_documents = [];
    }

    if (living_in_ireland === 'No') {
      for (const field of ['current_country', 'work_permission', 'requires_employment_permit', 'relocation_readiness'] as const) {
        if (!fields[field]) return { ok: false, error: 'International pathway questions are incomplete.' };
      }
    }

    if ('token' in body) {
      const token = stringValue(body.token, 'Invitation token', 256, true);
      if (!token.ok) return token;
      fields.token = token.value;
    }

    return { ok: true, value: fields as CandidateApplicationInput };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid application.' };
  }
}

export function validateAdminLogin(body: Record<string, unknown>) {
  const email = emailValue(body.email, true);
  if (!email.ok) return email;
  const password = stringValue(body.password, 'Password', 256, true);
  if (!password.ok) return password;
  return { ok: true as const, value: { email: email.value as string, password: password.value as string } };
}

export function validateInvite(body: Record<string, unknown>) {
  const email = emailValue(body.email, true);
  if (!email.ok) return email;
  const name = stringValue(body.name, 'Candidate name', 160);
  if (!name.ok) return name;
  const role = enumValue(body.role, 'Role', recruitmentRoles);
  if (!role.ok) return role;
  const expiryDate = body.expiryDate === undefined || body.expiryDate === null || body.expiryDate === ''
    ? { ok: true as const, value: null }
    : dateValue(body.expiryDate, 'Expiry date');
  if (!expiryDate.ok) return expiryDate;
  return { ok: true as const, value: { email: email.value as string, name: name.value, role: role.value, expiryDate: expiryDate.value } };
}

export function validateApplicationPatch(body: Record<string, unknown>) {
  const status = body.status === undefined ? { ok: true as const, value: null } : enumValue(body.status, 'Status', recruitmentStatuses);
  if (!status.ok) return status;
  const notes = stringValue(body.notes, 'Notes', 10000);
  if (!notes.ok) return notes;
  const notify = boolValue(body.notify_candidate, 'Notify candidate');
  if (!notify.ok) return notify;
  return { ok: true as const, value: { status: status.value, notes: notes.value, notify_candidate: notify.value } };
}

export function validatePasswordResetRequest(body: Record<string, unknown>) {
  const email = emailValue(body.email, true);
  if (!email.ok) return email;
  return { ok: true as const, value: { email: email.value as string } };
}

export function validatePasswordResetConfirm(body: Record<string, unknown>) {
  const token = stringValue(body.token, 'Reset token', 512, true);
  if (!token.ok) return token;
  const password = stringValue(body.password, 'Password', 256, true);
  if (!password.ok) return password;
  return { ok: true as const, value: { token: token.value as string, password: password.value as string } };
}
