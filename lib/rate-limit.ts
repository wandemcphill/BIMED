type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number | null;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  request: {
    headers: Headers;
  };
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __bimedRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

const store = globalThis.__bimedRateLimitStore || new Map<string, RateLimitEntry>();
globalThis.__bimedRateLimitStore = store;

function getClientIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown';
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const clientIp = getClientIp(options.request.headers);
  const bucketKey = `${options.key}:${clientIp}`;
  const now = Date.now();
  const existing = store.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(options.limit - 1, 0),
      retryAfterSeconds: null,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: Math.max(options.limit - existing.count, 0),
    retryAfterSeconds: null,
  };
}
