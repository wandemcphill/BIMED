import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The limiter fails closed, so a broken RPC denies every request. That is what happened
 * in production: check_recruitment_rate_limit declared a parameter named `bucket_key`,
 * colliding with the column of the same name, so every call raised SQLSTATE 42702 and
 * admin login, invitation creation and candidate submission all returned HTTP 429.
 *
 * The contract that broke is the parameter names passed through PostgREST, so the first
 * test reads them straight out of supabase/schema.sql rather than hard-coding them:
 * renaming on either side fails here.
 */

type RpcCall = { fn: string; args: Record<string, unknown> };

const calls: RpcCall[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: [{ allowed: true, remaining: 5, retry_after_seconds: null }], error: null };
let rpcThrows = false;

vi.mock('@/lib/db', () => ({
  db: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (rpcThrows) throw new Error('connection reset');
      return rpcResult;
    },
  }),
}));

const { checkRateLimit } = await import('@/lib/rate-limit');

/** Parameter names declared by check_recruitment_rate_limit in the checked-in schema. */
function schemaParameterNames(): string[] {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/schema.sql'), 'utf8');
  const match = sql.match(/create or replace function check_recruitment_rate_limit\s*\(([^)]*)\)/i);
  if (!match) throw new Error('check_recruitment_rate_limit not found in supabase/schema.sql');
  return match[1]
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function request(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) };
}

beforeEach(() => {
  calls.length = 0;
  rpcThrows = false;
  rpcResult = { data: [{ allowed: true, remaining: 5, retry_after_seconds: null }], error: null };
});

describe('rpc contract', () => {
  it('passes exactly the parameter names declared in supabase/schema.sql', async () => {
    await checkRateLimit({ key: 'admin-session', limit: 8, windowMs: 3_600_000, request: request() });

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('check_recruitment_rate_limit');
    expect(Object.keys(calls[0].args).sort()).toEqual(schemaParameterNames().sort());
  });

  it('never passes a parameter whose name collides with a table column', async () => {
    await checkRateLimit({ key: 'admin-session', limit: 8, windowMs: 3_600_000, request: request() });

    // bucket_key, window_start, request_count and updated_at are columns of
    // recruitment_rate_limits; reusing one as a parameter name is what caused 42702.
    for (const column of ['bucket_key', 'window_start', 'request_count', 'updated_at']) {
      expect(Object.keys(calls[0].args)).not.toContain(column);
    }
  });

  it('converts the window to whole seconds, never below one', async () => {
    await checkRateLimit({ key: 'k', limit: 3, windowMs: 1, request: request() });
    expect(Object.values(calls[0].args)).toContain(1);
  });
});

describe('bucket key derivation', () => {
  it('uses the first address in x-forwarded-for', async () => {
    await checkRateLimit({
      key: 'candidate-application',
      limit: 12,
      windowMs: 3_600_000,
      request: request({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }),
    });

    expect(Object.values(calls[0].args)).toContain('candidate-application:203.0.113.7');
  });

  it('falls back to x-real-ip, then cf-connecting-ip, then unknown', async () => {
    await checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, request: request({ 'x-real-ip': '198.51.100.4' }) });
    expect(Object.values(calls[0].args)).toContain('k:198.51.100.4');

    calls.length = 0;
    await checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, request: request({ 'cf-connecting-ip': '198.51.100.9' }) });
    expect(Object.values(calls[0].args)).toContain('k:198.51.100.9');

    calls.length = 0;
    await checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, request: request() });
    expect(Object.values(calls[0].args)).toContain('k:unknown');
  });
});

describe('results', () => {
  it('reports an allowed request', async () => {
    rpcResult = { data: [{ allowed: true, remaining: 4, retry_after_seconds: null }], error: null };

    expect(await checkRateLimit({ key: 'k', limit: 5, windowMs: 1000, request: request() }))
      .toEqual({ allowed: true, remaining: 4, retryAfterSeconds: null });
  });

  it('reports a denied request with its retry hint', async () => {
    rpcResult = { data: [{ allowed: false, remaining: 0, retry_after_seconds: 3600 }], error: null };

    expect(await checkRateLimit({ key: 'k', limit: 5, windowMs: 1000, request: request() }))
      .toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 3600 });
  });

  it('accepts a single row as well as an array', async () => {
    rpcResult = { data: { allowed: true, remaining: 2, retry_after_seconds: null }, error: null };

    expect((await checkRateLimit({ key: 'k', limit: 5, windowMs: 1000, request: request() })).allowed).toBe(true);
  });
});

describe('failing closed', () => {
  it('denies the request when the RPC returns an error', async () => {
    // Exactly the production failure: 42702 from an ambiguous column reference.
    rpcResult = { data: null, error: { code: '42702', message: 'column reference "bucket_key" is ambiguous' } };

    expect(await checkRateLimit({ key: 'k', limit: 5, windowMs: 1000, request: request() }))
      .toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
  });

  it('denies the request when the database call throws', async () => {
    rpcThrows = true;

    expect((await checkRateLimit({ key: 'k', limit: 5, windowMs: 1000, request: request() })).allowed).toBe(false);
  });
});
