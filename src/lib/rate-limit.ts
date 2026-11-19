import "server-only";
import { NextResponse } from "next/server";

/**
 * v2.8.78.0 — GLOBAL RATE LIMITING (the Phase 2.10 launch gap).
 *
 * One shared in-memory sliding-window limiter for the whole app:
 *
 *   · src/middleware.ts uses it for EVERY non-exempt /api/* call — a generous
 *     general bucket (120/min per IP) so normal dashboards never feel it, plus
 *     a much tighter bucket for the public form POSTs (8/10 min per IP) and a
 *     wide-but-capped bucket for media thumbs (300/min).
 *   · The auth routes that middleware does NOT cover (everything under the
 *     exempt /api/admin + /api/lms-admin prefixes, and the portal password
 *     route that prefers its HTTP-200 status contract) use the same helpers
 *     in-route to count FAILED credential attempts (8/15 min per IP) — the
 *     exact pattern /api/admin/auth/login has had since 2.8.27.0, now shared.
 *
 * Storage is `globalThis`-memoised so dev hot-reload and route-split bundles
 * share one map (same trick as the login limiter). On Vercel each lambda has
 * its own memory — limits are then per-instance best effort, which is still a
 * massive improvement over nothing. Buckets are pruned lazily; a hard
 * MAX_BUCKETS valve keeps a flood of spoofed IPs from growing memory.
 */

export type RateBucket = {
  /** Namespace inside the shared map (e.g. "api_general", "auth_fails"). */
  name: string;
  /** Maximum hits inside the window before the key is limited. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/** Middleware — every non-exempt API call, per IP. Generous on purpose. */
export const BUCKET_API_GENERAL: RateBucket = {
  name: "api_general",
  limit: 120,
  windowMs: 60_000,
};

/** Middleware — public form submissions (contact/admissions/appointments). */
export const BUCKET_FORM_POST: RateBucket = {
  name: "form_post",
  limit: 8,
  windowMs: 10 * 60_000,
};

/** Middleware — media thumbnails (heavy pages legitimately load dozens). */
export const BUCKET_MEDIA_THUMB: RateBucket = {
  name: "media_thumb",
  limit: 300,
  windowMs: 60_000,
};

/** In-route — failed credential attempts on every sign-in surface. */
export const BUCKET_AUTH_FAILS: RateBucket = {
  name: "auth_fails",
  limit: 8,
  windowMs: 15 * 60_000,
};

/** In-route — one-time setup endpoints (all attempts, not just failures). */
export const BUCKET_SETUP: RateBucket = {
  name: "setup_attempts",
  limit: 10,
  windowMs: 10 * 60_000,
};

const MAX_BUCKETS = 5000;

const globalForRate = globalThis as typeof globalThis & {
  __stcRateBuckets?: Map<string, Map<string, number[]>>;
};
const store =
  globalForRate.__stcRateBuckets ?? new Map<string, Map<string, number[]>>();
globalForRate.__stcRateBuckets = store;

/** Best-effort client IP (the preview proxy + Vercel both set XFF). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

/** Lazily drop expired keys so a flood of spoofed IPs cannot grow memory. */
function prune(hits: Map<string, number[]>, now: number) {
  if (hits.size <= MAX_BUCKETS) return;
  for (const [key, arr] of hits) {
    if (!arr.some((t) => t > now - 60 * 60_000)) hits.delete(key);
  }
  if (hits.size > MAX_BUCKETS * 2) hits.clear();
}

function windowHits(bucket: RateBucket, key: string): number[] {
  const now = Date.now();
  let hits = store.get(bucket.name);
  if (!hits) {
    hits = new Map<string, number[]>();
    store.set(bucket.name, hits);
  }
  prune(hits, now);
  const kept = (hits.get(key) ?? []).filter((t) => t > now - bucket.windowMs);
  hits.set(key, kept);
  return kept;
}

/**
 * Record a hit and report whether the key is now over the limit.
 * Returns the number of SECONDS the caller should wait (0 = allowed).
 */
export function hitRateLimit(bucket: RateBucket, key: string): number {
  const kept = windowHits(bucket, key);
  kept.push(Date.now());
  if (kept.length > bucket.limit) {
    const oldest = kept[0];
    return Math.max(1, Math.ceil((oldest + bucket.windowMs - Date.now()) / 1000));
  }
  return 0;
}

/** Check-only read (no hit recorded) — used before doing credential work. */
export function peekRateLimit(bucket: RateBucket, key: string): number {
  const kept = windowHits(bucket, key);
  if (kept.length >= bucket.limit) {
    const oldest = kept[0];
    return Math.max(1, Math.ceil((oldest + bucket.windowMs - Date.now()) / 1000));
  }
  return 0;
}

/** Record a failure into the shared auth-fail bucket (in-route limiters). */
export function recordAuthFailure(key: string) {
  hitRateLimit(BUCKET_AUTH_FAILS, key);
}

/** Successful sign-in clears the IP's auth-fail history. */
export function clearAuthFailures(key: string) {
  const hits = store.get(BUCKET_AUTH_FAILS.name);
  if (hits) hits.delete(key);
}

/** Standard 429 response body/header shape for API routes + middleware. */
export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again shortly.",
      status: "rate_limited",
    },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.ceil(retryAfterSeconds)),
        "cache-control": "no-store",
      },
    },
  );
}
