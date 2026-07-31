import { describe, it, expect } from "vitest";
import { aggregateShadow, type ShadowEvent } from "./shadow";

// Locks lib/shadow.ts against src/breakerbox/report/shadow.py `aggregate_shadow`. Fixtures are
// hand-computed by the same rules: first would-trip = min seq; prevented = max(cumulative over ALL
// events) − first would-trip's cumulative; by_reason/by_policy count every would_trip.
const ev = (
  run_id: string,
  seq: number,
  type: string,
  cumulative_microusd: number,
  detail: Record<string, unknown> | null = null,
): ShadowEvent => ({ run_id, seq, type, cumulative_microusd, detail });

describe("aggregateShadow", () => {
  // Run A: two would-trips (budget@seq3, then a ladder graceful-stop@seq5), spend continues to 200.
  // Events are intentionally out of seq order to prove first = min(seq), not array order.
  const runA: ShadowEvent[] = [
    ev("A", 1, "reconcile", 40),
    ev("A", 5, "would_trip", 160, { reason: "velocity", policy: "ladder:graceful_stop@1.00" }),
    ev("A", 3, "would_trip", 100, { reason: "budget", policy: "budget" }),
    ev("A", 7, "reconcile", 200),
  ];
  // Run B: one would-trip (loop@seq2), spend continues to 120.
  const runB: ShadowEvent[] = [
    ev("B", 1, "reconcile", 50),
    ev("B", 2, "would_trip", 80, { reason: "loop", policy: "loop" }),
    ev("B", 3, "reconcile", 120),
  ];
  // Run C: clean — no would-trip. Counts as scanned, never as would-trip.
  const runC: ShadowEvent[] = [ev("C", 1, "reconcile", 10), ev("C", 2, "reconcile", 30)];

  it("aggregates across mixed runs exactly like shadow.py", () => {
    const s = aggregateShadow([...runA, ...runB, ...runC]);
    expect(s.runs_scanned).toBe(3);
    expect(s.runs_would_trip).toBe(2); // A and B; C is clean
    // by_reason / by_policy count every would_trip event
    expect(s.by_reason).toEqual({ budget: 1, velocity: 1, loop: 1 });
    expect(s.by_policy).toEqual({ budget: 1, "ladder:graceful_stop@1.00": 1, loop: 1 });
    // A prevented = 200 (final) − 100 (first would-trip @seq3) = 100; B = 120 − 80 = 40
    expect(s.would_prevent_micro).toBe(140);
    // top_runs sorted by prevented desc; first-would-trip reason attributed to the run
    expect(s.top_runs).toEqual([
      { run_id: "A", reason: "budget", prevented_micro: 100 },
      { run_id: "B", reason: "loop", prevented_micro: 40 },
    ]);
  });

  it("reports zero when nothing would trip", () => {
    const s = aggregateShadow(runC);
    expect(s.runs_scanned).toBe(1);
    expect(s.runs_would_trip).toBe(0);
    expect(s.would_prevent_micro).toBe(0);
    expect(s.top_runs).toEqual([]);
    expect(s.by_reason).toEqual({});
  });

  it("never reports negative prevented when the would-trip is the last event", () => {
    // first would-trip is also the max cumulative → prevented clamps to 0, not negative
    const s = aggregateShadow([
      ev("D", 1, "reconcile", 30),
      ev("D", 2, "would_trip", 90, { reason: "hops", policy: "hops" }),
    ]);
    expect(s.runs_would_trip).toBe(1);
    expect(s.would_prevent_micro).toBe(0);
  });
});
