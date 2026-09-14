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
  | 'admin_contract_signed'
  | 'document_ready_to_sign'
  | 'admin_document_signed'
  | 'onboarding_pack'
  | 'recruitment_invite'
  | 'second_interview_invite'
  | 'admin_second_interview_completed'
  | 'staff_activation';

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
