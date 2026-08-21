import { db } from '@/lib/db';

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

function getClientIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown';
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const clientIp = getClientIp(options.request.headers);
  const bucketKey = `${options.key}:${clientIp}`;

  try {
    const client = db();
    // Parameter names are p_-prefixed: the unprefixed `bucket_key` collided with the
    // column of the same name and made every call fail with SQLSTATE 42702.
    const { data, error } = await client.rpc('check_recruitment_rate_limit', {
      p_bucket_key: bucketKey,
      p_max_requests: options.limit,
      p_window_seconds: Math.max(Math.ceil(options.windowMs / 1000), 1),
    });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      remaining: Number(row?.remaining ?? 0),
      retryAfterSeconds: row?.retry_after_seconds ?? null,
    };
  } catch (error) {
    console.error('Rate limit check failed', error);
    return {
      // Do not silently disable abuse protection during a database outage.
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    };
  }
}
