import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Distributed rate limiter. With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// set, this uses Upstash's sliding-window limiter — counters are shared across
// every Vercel function instance so a determined attacker can't sidestep the
// limit by hitting many warm lambdas at once. Without the env vars, falls back
// to the in-memory per-instance counter (good enough for local dev and small
// single-instance deployments, but NOT for production at scale).
//
// API note: rateLimit() is async because the Upstash backend is an HTTP REST
// call. The in-memory fallback resolves synchronously inside the promise. All
// callers `await` the result.

interface Bucket { count: number; resetAt: number }
const memBuckets = new Map<string, Bucket>();

let warned = false;
let redis: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      console.warn("ratelimit: UPSTASH_REDIS_REST_URL/TOKEN not set — falling back to in-memory limiter (single-instance only)");
      warned = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

function limiterFor(limit: number, windowMs: number): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cacheKey = `${limit}:${windowMs}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;
  const seconds = Math.max(1, Math.round(windowMs / 1000));
  const rl = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, `${seconds} s`),
    analytics: false,
    prefix: "veryfi:rl",
  });
  limiterCache.set(cacheKey, rl);
  return rl;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const rl = limiterFor(limit, windowMs);
  if (rl) {
    const res = await rl.limit(key);
    return {
      ok: res.success,
      retryAfterSec: res.success ? 0 : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)),
    };
  }
  // In-memory fallback (single instance).
  const now = Date.now();
  const b = memBuckets.get(key);
  if (!b || now > b.resetAt) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

// Housekeeping for the in-memory fallback — Redis handles expiration itself.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memBuckets) if (now > v.resetAt) memBuckets.delete(k);
  }, 60_000).unref?.();
}
