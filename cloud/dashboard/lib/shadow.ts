// #154b — hosted shadow report aggregation.
//
// SOURCE OF TRUTH: src/breakerbox/report/shadow.py `aggregate_shadow`. Keep this in lockstep — the
// Python version aggregates local *.jsonl run logs; this one aggregates the same events out of the
// cloud `events` table. Semantics mirrored exactly:
//   - a run "would trip" if it has any `would_trip` event (guard() dedups them per reason);
//   - `first` would-trip = the one with the smallest seq;
//   - a run's prevented spend = max(cumulative across ALL its events) − first would-trip's cumulative
//     (clamped ≥ 0): the money that was spent AFTER the point enforcement would have stopped it;
//   - by_reason / by_policy count every would_trip event's decision.reason / .policy.
// lib/shadow.test.ts locks this against hand-computed fixtures (multi-reason, single, clean run).

export type ShadowEvent = {
  run_id: string;
  seq: number | null;
  type: string;
  cumulative_microusd: number | null;
  detail: Record<string, unknown> | null;
};

export type ShadowSummary = {
  runs_scanned: number;
  runs_would_trip: number;
  by_reason: Record<string, number>;
  by_policy: Record<string, number>;
  would_prevent_micro: number;
  top_runs: { run_id: string; reason: string; prevented_micro: number }[];
};

const str = (v: unknown, fallback = "unknown") => (typeof v === "string" ? v : fallback);

export function aggregateShadow(events: ShadowEvent[]): ShadowSummary {
  const runs = new Map<string, ShadowEvent[]>();
  for (const e of events) {
    const arr = runs.get(e.run_id);
    if (arr) arr.push(e);
    else runs.set(e.run_id, [e]);
  }

  const by_reason: Record<string, number> = {};
  const by_policy: Record<string, number> = {};
  let prevented = 0;
  const top: { run_id: string; reason: string; prevented_micro: number }[] = [];

  for (const [run_id, evs] of runs) {
    const would = evs.filter((e) => e.type === "would_trip");
    if (would.length === 0) continue;
    const first = would.reduce((a, b) => ((a.seq ?? 0) <= (b.seq ?? 0) ? a : b));
    for (const e of would) {
      const reason = str(e.detail?.reason);
      const policy = str(e.detail?.policy);
      by_reason[reason] = (by_reason[reason] ?? 0) + 1;
      by_policy[policy] = (by_policy[policy] ?? 0) + 1;
    }
    const final = Math.max(...evs.map((e) => e.cumulative_microusd ?? 0));
    const runPrevented = Math.max(0, final - (first.cumulative_microusd ?? 0));
    prevented += runPrevented;
    top.push({ run_id, reason: str(first.detail?.reason), prevented_micro: runPrevented });
  }
  top.sort((a, b) => b.prevented_micro - a.prevented_micro);

  return {
    runs_scanned: runs.size,
    runs_would_trip: top.length,
    by_reason,
    by_policy,
    would_prevent_micro: prevented,
    top_runs: top.slice(0, 10),
  };
}
