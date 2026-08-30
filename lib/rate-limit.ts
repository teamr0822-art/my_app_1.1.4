/**
 * Tiny in-memory rate limiter.
 *
 * The chat endpoint is public and every call costs money on the Gemini side,
 * so one visitor (or a crawler) must not be able to drain the quota that the
 * demo depends on. Serverless instances are short-lived, so this is a speed
 * bump rather than a wall — but it is enough to stop a stuck client from
 * looping and to keep the free tier alive during a presentation.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type RateLimitResult = { ok: boolean; retryAfter: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    // Cheap guard against unbounded growth on a long-lived instance.
    if (buckets.size >= MAX_KEYS) buckets.clear();
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  bucket.hits.push(now);
  return { ok: true, retryAfter: 0 };
}

/** Best-effort caller identity: the proxy header first, then the socket. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim();
  return ip || req.headers.get("x-real-ip") || "unknown";
}
