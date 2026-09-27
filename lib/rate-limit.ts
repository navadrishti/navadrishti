import { NextResponse } from 'next/server';

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number; retryAfterSeconds: 0 }
  | { allowed: false; remaining: 0; retryAfterSeconds: number };

type Bucket = {
  hits: number[];
  windowMs: number;
};

export const AUTH_ATTEMPT_LIMIT: RateLimitOptions = { limit: 10, windowMs: 15 * 60 * 1000 };

const CLEANUP_INTERVAL_MS = 60 * 1000;

// Counters live in this process only, so each server instance enforces its own window.
const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;

function cleanup(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
    if (now - newest >= bucket.windowMs) buckets.delete(key);
  }
}

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const hits = (buckets.get(key)?.hits ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, { hits, windowMs });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits, windowMs });
  return { allowed: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
  lastCleanupAt = 0;
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function rateLimitedResponse(retryAfterSeconds: number, error = 'Too many attempts. Please try again later.') {
  return NextResponse.json(
    { error },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** Returns a 429 response once `identifier` has used up its attempts from this client IP. */
export function limitAttempts(
  request: Request,
  scope: string,
  identifier: string,
  options: RateLimitOptions = AUTH_ATTEMPT_LIMIT
) {
  const key = `${scope}:${getClientIp(request)}:${identifier.trim().toLowerCase()}`;
  const result = rateLimit(key, options);
  return result.allowed ? null : rateLimitedResponse(result.retryAfterSeconds);
}
