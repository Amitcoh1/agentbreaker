// Best-effort in-memory rate limit for the edge functions. Deno isolates are ephemeral and there can
// be many warm instances, so this is per-instance: it caps floods and accidental client retry-storms
// hitting a single warm instance, not a distributed attack. No dependency, no cold-start cost.
//
// The real defense against unauthenticated DB-amplification is key-shape pre-validation (a garbage
// x-ingest-key never reaches the DB — see ingest/index.ts). This token bucket is defense-in-depth on
// top of that, and a cheap guard against a buggy client stuck in a retry loop.
//
// ponytail: per-instance token bucket; swap the Map for Upstash/Deno KV if hard cross-instance caps
// are ever needed (tracked as a follow-up). Until then, generous limits so legit traffic never bites.

type Bucket = { tokens: number; ts: number };
const buckets = new Map<string, Bucket>();

/**
 * Token-bucket check. Returns false once `key` has spent its allowance; refills at `ratePerMin` up to
 * `burst`. `now` is injectable so the behaviour is testable without a real clock.
 */
export function allow(key: string, ratePerMin = 600, burst = 200, now = Date.now()): boolean {
  const refillPerMs = ratePerMin / 60_000;
  const b = buckets.get(key) ?? { tokens: burst, ts: now };
  b.tokens = Math.min(burst, b.tokens + (now - b.ts) * refillPerMs);
  b.ts = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(key, b);
  // Opportunistic cleanup so a churn of distinct keys can't grow the map without bound.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now - v.ts > 300_000) buckets.delete(k);
  }
  return ok;
}

/** Client IP from the edge proxy headers, for keying anonymous callers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Reset hook for tests — not used at runtime.
export function _reset(): void {
  buckets.clear();
}
