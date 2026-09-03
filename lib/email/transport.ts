/**
 * Server-only Resend transport.
 *
 * Responsibilities:
 *  - lazily construct the Resend client from RESEND_API_KEY (never bundled client-side)
 *  - enforce a request timeout and retry transient failures
 *  - claim a dedupe key in recruitment_email_log so a repeated request does not resend
 *  - emit structured logs that never contain the API key, reset tokens or full recipients
 *
 * Nothing here throws to the caller: send failures are reported in the return value so a
 * recruitment write is never rolled back because an email bounced.
 */

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getResendFromEmail } from '../recruitment-config';
import { sanitizeSubject, type EmailContent } from './templates';

if (typeof window !== 'undefined') {
  throw new Error('lib/email/transport.ts is server-only and must not be imported from client code.');
}

const SEND_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

export type EmailType =
  | 'application_received'
  | 'application_status_update'
  | 'interview_invitation'
  | 'interview_rescheduled'
  | 'interview_cancelled'
  | 'admin_new_application'
  | 'admin_interview_update'
  | 'admin_status_change'
  | 'admin_password_reset'
  | 'contract_ready_to_sign'
  | 'admin_contract_signed';

export type SendResult =
  | { status: 'sent'; messageId: string | null }
  | { status: 'skipped'; reason: 'duplicate' | 'not_configured' | 'invalid_recipient' }
  | { status: 'failed'; reason: string };

export type SendRequest = {
  to: string;
  content: EmailContent;
  emailType: EmailType;
  /**
   * Stable key identifying this logical email. A second attempt to claim the same key is
   * treated as a duplicate and skipped. Omit to disable duplicate protection.
   */
  dedupeKey?: string;
  /** When set, a claim older than this window is allowed to send again. */
  dedupeWindowMs?: number;
  applicationId?: string | null;
  /** Optional Supabase client; without one, duplicate protection and logging are skipped. */
  client?: SupabaseClient | null;
  replyTo?: string;
};

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * A single, plain address only. Rejects commas, semicolons, angle brackets and CR/LF so a
 * user-controlled value cannot smuggle in extra recipients or header lines.
 */
export function isValidRecipient(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed) && !/[\r\n\t]/.test(trimmed);
}

/** Logs are structured and deliberately lossy: never a full address, never a token. */
export function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  if (!domain) {
    return '***';
  }
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
}

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

let cachedClient: Resend | null = null;
let cachedKey: string | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Resend(apiKey);
    cachedKey = apiKey;
  }

  return cachedClient;
}

/**
 * Test seam: lets unit tests substitute the provider without a network call or an API key.
 */
export type EmailSender = (payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) => Promise<{ id: string | null }>;

let senderOverride: EmailSender | null = null;

export function __setEmailSenderForTests(sender: EmailSender | null) {
  senderOverride = sender;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims dedupeKey. Returns false when this email was already sent (or is in flight),
 * in which case the caller must not send.
 *
 * A claim failure caused by the database being unreachable returns true: losing duplicate
 * protection is preferable to silently dropping a candidate's only notification.
 */
async function claimDedupeKey(
  client: SupabaseClient,
  input: { dedupeKey: string; emailType: EmailType; applicationId?: string | null; recipientHint: string; windowMs?: number }
): Promise<boolean> {
  try {
    if (input.windowMs && input.windowMs > 0) {
      const cutoff = new Date(Date.now() - input.windowMs).toISOString();
      const { data: existing } = await client
        .from('recruitment_email_log')
        .select('id, created_at')
        .eq('dedupe_key', input.dedupeKey)
        .maybeSingle();

      if (existing && existing.created_at && existing.created_at > cutoff) {
        return false;
      }

      const { error: upsertError } = await client.from('recruitment_email_log').upsert(
        {
          dedupe_key: input.dedupeKey,
          email_type: input.emailType,
          application_id: input.applicationId || null,
          recipient_hint: input.recipientHint,
          status: 'pending',
          attempts: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dedupe_key' }
      );

      if (upsertError) {
        throw upsertError;
      }

      return true;
    }

    const { error } = await client.from('recruitment_email_log').insert({
      dedupe_key: input.dedupeKey,
      email_type: input.emailType,
      application_id: input.applicationId || null,
      recipient_hint: input.recipientHint,
      status: 'pending',
      attempts: 0,
    });

    if (error) {
      // 23505 = unique_violation: another request already claimed this exact email.
      if (error.code === '23505') {
        return false;
      }
      throw error;
    }

    return true;
  } catch (error) {
    log('warn', 'email.dedupe_unavailable', {
      email_type: input.emailType,
      dedupe_key: input.dedupeKey,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return true;
  }
}

async function finalizeLog(
  client: SupabaseClient | null | undefined,
  dedupeKey: string | undefined,
  patch: { status: string; provider_message_id?: string | null; error_message?: string | null; attempts: number }
) {
  if (!client || !dedupeKey) {
    return;
  }

  // Bookkeeping only: a logging problem must never surface to the caller, because the
  // email itself may already have been delivered.
  try {
    const { error } = await client
      .from('recruitment_email_log')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('dedupe_key', dedupeKey);

    if (error) {
      log('warn', 'email.log_update_failed', { dedupe_key: dedupeKey, reason: error.message });
    }
  } catch (error) {
    log('warn', 'email.log_update_failed', {
      dedupe_key: dedupeKey,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Sends one transactional email. Never throws.
 */
export async function sendTransactionalEmail(request: SendRequest): Promise<SendResult> {
  const recipient = request.to?.trim() || '';

  if (!isValidRecipient(recipient)) {
    log('warn', 'email.invalid_recipient', { email_type: request.emailType });
    return { status: 'skipped', reason: 'invalid_recipient' };
  }

  const sender = senderOverride ?? buildResendSender();

  if (!sender) {
    log('warn', 'email.not_configured', {
      email_type: request.emailType,
      detail: 'RESEND_API_KEY is not set; email was not sent.',
    });
    return { status: 'skipped', reason: 'not_configured' };
  }

  if (request.dedupeKey && request.client) {
    const claimed = await claimDedupeKey(request.client, {
      dedupeKey: request.dedupeKey,
      emailType: request.emailType,
      applicationId: request.applicationId,
      recipientHint: maskEmail(recipient),
      windowMs: request.dedupeWindowMs,
    });

    if (!claimed) {
      log('info', 'email.duplicate_suppressed', { email_type: request.emailType, dedupe_key: request.dedupeKey });
      return { status: 'skipped', reason: 'duplicate' };
    }
  }

  const payload = {
    from: getResendFromEmail(),
    to: recipient,
    subject: sanitizeSubject(request.content.subject),
    html: request.content.html,
    text: request.content.text,
    ...(request.replyTo ? { replyTo: request.replyTo } : {}),
  };

  let lastError = 'unknown error';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await withTimeout(sender(payload), SEND_TIMEOUT_MS, 'Resend send');

      log('info', 'email.sent', {
        email_type: request.emailType,
        recipient: maskEmail(recipient),
        attempt,
        message_id: result.id,
      });

      await finalizeLog(request.client, request.dedupeKey, {
        status: 'sent',
        provider_message_id: result.id,
        error_message: null,
        attempts: attempt,
      });

      return { status: 'sent', messageId: result.id };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error';
      const retryable = attempt < MAX_ATTEMPTS && isRetryable(error);

      log(retryable ? 'warn' : 'error', 'email.send_failed', {
        email_type: request.emailType,
        recipient: maskEmail(recipient),
        attempt,
        retrying: retryable,
        reason: lastError,
      });

      if (!retryable) {
        break;
      }

      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  await finalizeLog(request.client, request.dedupeKey, {
    status: 'failed',
    error_message: lastError.slice(0, 500),
    attempts: MAX_ATTEMPTS,
  });

  return { status: 'failed', reason: lastError };
}

function buildResendSender(): EmailSender | null {
  const client = getResendClient();

  if (!client) {
    return null;
  }

  return async (payload) => {
    const { data, error } = await client.emails.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    });

    if (error) {
      // Resend returns { data: null, error } rather than throwing.
      const failure = new Error(error.message || 'Resend rejected the message') as Error & { name: string };
      failure.name = error.name || 'ResendError';
      throw failure;
    }

    return { id: data?.id ?? null };
  };
}

/**
 * Retry only on transient conditions. A 4xx validation error or an unverified sender will
 * fail the same way on every attempt, so retrying just delays the log line.
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message.includes('timed out')) {
    return true;
  }

  if (/\b(429|500|502|503|504)\b/.test(message)) {
    return true;
  }

  return (
    message.includes('rate limit') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('socket hang up') ||
    message.includes('fetch failed')
  );
}

export { log as logEmailEvent };
