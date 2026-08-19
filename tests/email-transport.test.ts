import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setEmailSenderForTests,
  isEmailConfigured,
  isValidRecipient,
  maskEmail,
  sendTransactionalEmail,
  type EmailSender,
} from '@/lib/email/transport';
import { createFakeSupabase } from './helpers/fake-supabase';

const content = { subject: 'Test subject', html: '<p>hello</p>', text: 'hello' };

function recordingSender(behaviour?: (attempt: number) => void) {
  const calls: Array<Record<string, unknown>> = [];
  let attempt = 0;

  const sender: EmailSender = async (payload) => {
    attempt += 1;
    calls.push(payload);
    behaviour?.(attempt);
    return { id: `msg-${attempt}` };
  };

  return { sender, calls, attempts: () => attempt };
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  __setEmailSenderForTests(null);
  vi.restoreAllMocks();
});

afterEach(() => {
  __setEmailSenderForTests(null);
});

describe('recipient validation', () => {
  it('accepts a single plain address', () => {
    expect(isValidRecipient('ada@example.com')).toBe(true);
  });

  it('rejects header injection and multiple recipients', () => {
    expect(isValidRecipient('ada@example.com\r\nBcc: attacker@example.com')).toBe(false);
    expect(isValidRecipient('ada@example.com, attacker@example.com')).toBe(false);
    expect(isValidRecipient('ada@example.com; attacker@example.com')).toBe(false);
    expect(isValidRecipient('Ada <ada@example.com>')).toBe(false);
    expect(isValidRecipient('not-an-email')).toBe(false);
    expect(isValidRecipient('')).toBe(false);
    expect(isValidRecipient(null)).toBe(false);
  });

  it('does not send to an invalid recipient', async () => {
    const { sender, attempts } = recordingSender();
    __setEmailSenderForTests(sender);

    const result = await sendTransactionalEmail({
      to: 'ada@example.com\r\nBcc: attacker@example.com',
      content,
      emailType: 'application_received',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'invalid_recipient' });
    expect(attempts()).toBe(0);
  });
});

describe('missing RESEND_API_KEY', () => {
  it('reports isEmailConfigured false and skips sending', async () => {
    expect(isEmailConfigured()).toBe(false);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendTransactionalEmail({
      to: 'ada@example.com',
      content,
      emailType: 'application_received',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'not_configured' });
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('email.not_configured');
  });

  it('reports configured once a key is present', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    expect(isEmailConfigured()).toBe(true);
  });
});

describe('successful delivery', () => {
  it('sends and records the provider message id', async () => {
    const { sender, calls } = recordingSender();
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const db = createFakeSupabase();
    const result = await sendTransactionalEmail({
      to: 'ada@example.com',
      content,
      emailType: 'application_received',
      dedupeKey: 'application_received:app-1',
      applicationId: 'app-1',
      client: db as never,
    });

    expect(result).toEqual({ status: 'sent', messageId: 'msg-1' });
    expect(calls[0].to).toBe('ada@example.com');
    expect(calls[0].from).toBe('Bimed Healthcare <noreply@bimedhealthcare.com>');

    const logged = db.rows('recruitment_email_log');
    expect(logged).toHaveLength(1);
    expect(logged[0].status).toBe('sent');
    expect(logged[0].provider_message_id).toBe('msg-1');
    // The log stores a masked hint, never the full address.
    expect(logged[0].recipient_hint).toBe('ad***@example.com');
  });

  it('sanitises the subject before handing it to the provider', async () => {
    const { sender, calls } = recordingSender();
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendTransactionalEmail({
      to: 'ada@example.com',
      content: { ...content, subject: 'Hello\r\nBcc: attacker@example.com' },
      emailType: 'application_received',
    });

    expect(calls[0].subject).toBe('Hello Bcc: attacker@example.com');
    expect(String(calls[0].subject)).not.toMatch(/[\r\n]/);
  });
});

describe('duplicate protection', () => {
  it('does not resend when the same dedupe key is claimed twice', async () => {
    const { sender, attempts } = recordingSender();
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const db = createFakeSupabase();
    const request = {
      to: 'ada@example.com',
      content,
      emailType: 'application_received' as const,
      dedupeKey: 'application_received:app-1',
      applicationId: 'app-1',
      client: db as never,
    };

    const first = await sendTransactionalEmail(request);
    const second = await sendTransactionalEmail(request);

    expect(first.status).toBe('sent');
    expect(second).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(attempts()).toBe(1);
    expect(db.rows('recruitment_email_log')).toHaveLength(1);
  });

  it('allows a repeat once the dedupe window has passed', async () => {
    const { sender, attempts } = recordingSender();
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const db = createFakeSupabase();
    const request = {
      to: 'ada@example.com',
      content,
      emailType: 'application_status_update' as const,
      dedupeKey: 'application_status_update:app-1:Interview',
      dedupeWindowMs: 10 * 60 * 1000,
      client: db as never,
    };

    await sendTransactionalEmail(request);
    const blocked = await sendTransactionalEmail(request);
    expect(blocked).toEqual({ status: 'skipped', reason: 'duplicate' });

    // Age the claim past the window.
    db.rows('recruitment_email_log')[0].created_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const allowed = await sendTransactionalEmail(request);
    expect(allowed.status).toBe('sent');
    expect(attempts()).toBe(2);
  });

  it('still sends when the dedupe store is unavailable', async () => {
    const { sender } = recordingSender();
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const brokenClient = {
      from() {
        throw new Error('database unreachable');
      },
    };

    const result = await sendTransactionalEmail({
      to: 'ada@example.com',
      content,
      emailType: 'application_received',
      dedupeKey: 'application_received:app-1',
      client: brokenClient as never,
    });

    expect(result.status).toBe('sent');
  });
});

describe('failure handling', () => {
  it('retries a transient failure and then succeeds', async () => {
    const { sender, attempts } = recordingSender((attempt) => {
      if (attempt === 1) {
        throw new Error('503 service unavailable');
      }
    });
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendTransactionalEmail({ to: 'ada@example.com', content, emailType: 'application_received' });

    expect(result.status).toBe('sent');
    expect(attempts()).toBe(2);
  });

  it('does not retry a permanent failure', async () => {
    const { sender, attempts } = recordingSender(() => {
      throw new Error('422 domain is not verified');
    });
    __setEmailSenderForTests(sender);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendTransactionalEmail({ to: 'ada@example.com', content, emailType: 'application_received' });

    expect(result.status).toBe('failed');
    expect(attempts()).toBe(1);
    expect(error).toHaveBeenCalled();
  });

  it('marks the delivery log failed without throwing', async () => {
    const { sender } = recordingSender(() => {
      throw new Error('422 invalid payload');
    });
    __setEmailSenderForTests(sender);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const db = createFakeSupabase();
    const result = await sendTransactionalEmail({
      to: 'ada@example.com',
      content,
      emailType: 'application_received',
      dedupeKey: 'application_received:app-2',
      client: db as never,
    });

    expect(result.status).toBe('failed');
    const logged = db.rows('recruitment_email_log');
    expect(logged[0].status).toBe('failed');
    expect(logged[0].error_message).toContain('422');
  });

  it('never logs the API key', async () => {
    process.env.RESEND_API_KEY = 're_super_secret_key';
    const { sender } = recordingSender(() => {
      throw new Error('500 upstream failure');
    });
    __setEmailSenderForTests(sender);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendTransactionalEmail({ to: 'ada@example.com', content, emailType: 'application_received' });

    const everything = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');
    expect(everything).not.toContain('re_super_secret_key');
  });

  it('emits structured JSON log lines', async () => {
    const { sender } = recordingSender();
    __setEmailSenderForTests(sender);
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendTransactionalEmail({ to: 'ada@example.com', content, emailType: 'application_received' });

    const line = JSON.parse(String(info.mock.calls[0][0]));
    expect(line.event).toBe('email.sent');
    expect(line.level).toBe('info');
    expect(line.recipient).toBe('ad***@example.com');
  });
});

describe('maskEmail', () => {
  it('keeps only the first characters of the local part', () => {
    expect(maskEmail('ada@example.com')).toBe('ad***@example.com');
    expect(maskEmail('ab@example.com')).toBe('ab@example.com');
    expect(maskEmail('broken')).toBe('***');
  });
});
