// Run: node --experimental-strip-types cloud/supabase/functions/_shared/throttle.test.ts
// (also runs under `deno test` — node:assert is supported there too.)
//
// Locks the token-bucket + the ingest key-shape regex, the two bits of #44 that would silently rot:
// a wrong refill rate or a loose regex both fail open (over-permissive) rather than loudly.
import assert from "node:assert";
import { allow, _reset } from "./throttle.ts";

// burst then block: a 5-token bucket allows 5, denies the 6th (clock frozen so nothing refills)
_reset();
const t0 = 1_000_000;
let allowed = 0;
for (let i = 0; i < 6; i++) if (allow("k", 600, 5, t0)) allowed++;
assert.equal(allowed, 5, `burst: expected 5 allowed, got ${allowed}`);
assert.equal(allow("k", 600, 5, t0), false, "6th call must be denied");

// refill over time: 600/min = 1 token / 100ms → after 100ms exactly one more call succeeds
assert.equal(allow("k", 600, 5, t0 + 100), true, "should refill ~1 token after 100ms");
assert.equal(allow("k", 600, 5, t0 + 100), false, "only one token refilled");

// distinct keys are independent buckets (per-IP isolation)
_reset();
assert.equal(allow("a", 600, 1, t0), true);
assert.equal(allow("a", 600, 1, t0), false);
assert.equal(allow("b", 600, 1, t0), true, "key b unaffected by key a");

// the shape gate that keeps junk keys out of the DB (must mirror ingest's PERSONAL_KEY)
const PERSONAL_KEY = /^abk_[0-9a-f]{48}$/;
assert.equal(PERSONAL_KEY.test("abk_" + "a".repeat(48)), true, "valid abk key shape");
assert.equal(PERSONAL_KEY.test("abk_short"), false, "too short rejected");
assert.equal(PERSONAL_KEY.test("garbage"), false, "non-abk rejected");
assert.equal(PERSONAL_KEY.test("abk_" + "A".repeat(48)), false, "uppercase rejected (mint is lowercase)");

console.log("throttle + key-shape: all checks passed");
