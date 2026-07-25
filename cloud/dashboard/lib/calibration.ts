// Turn real run receipts into forecast assumptions — pure, no network, no execution.
//
// guard() writes a receipt per run ({run_id}.report.json via report/generate.py) with a per-node
// `timeline`: for each hop the node, model, and realized tokens_out. The heuristic forecast guesses
// two things it can't know up front — how many times a loop spins, and how many output tokens a
// model actually emits (vs the max_tokens reserve cap). Both are measured in the receipt. So we read
// them back and hand forecast() the real numbers, which narrows the p50–p95 band toward the truth.
//
// Still an estimate, not a quote: it's your own past runs projected forward. Needs a few runs before
// it means anything (one run is an anecdote), so below `minRuns` we return nothing and the caller
// falls back to the heuristic defaults.
import type { ForecastAssumptions } from "./forecast";

export interface ReceiptHop {
  kind?: string;
  node?: string | null;
  model?: string | null;
  tokens_out?: number | null;
}
export interface Receipt {
  run_id?: string;
  timeline?: ReceiptHop[] | null;
}

export interface Calibration {
  runs: number; // distinct runs the numbers are drawn from
  loopIterationsP50?: number;
  loopIterationsP95?: number;
  /** model -> realized output tokens (p50/p95) — feeds forecast's per-model override */
  perModelOutputTokens?: NonNullable<ForecastAssumptions["perModelOutputTokens"]>;
}

// Linear-interpolation percentile of an already-sorted ascending array (numpy's default). Nearest-
// rank collapses p50 onto p95 on tiny samples (2 runs), which would hide variance — the whole point.
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Derive forecast assumptions from run receipts. Pure. Dedupes by run_id (last wins). Returns only
 * `runs` when fewer than `minRuns` distinct runs are supplied — the caller should keep the heuristic.
 */
export function calibrate(receipts: Receipt[], minRuns = 2): Calibration {
  // Dedupe by run_id; receipts without one are each their own run (keyed by position).
  const byRun = new Map<string, Receipt>();
  receipts.forEach((r, i) => byRun.set(r.run_id || `__${i}`, r));
  const runs = [...byRun.values()].filter((r) => Array.isArray(r.timeline) && r.timeline.length);
  if (runs.length < minRuns) return { runs: runs.length };

  // Loop depth per run = the most times any single node was visited (linear run → 1).
  const perRunMaxVisits: number[] = [];
  // Output tokens per model, pooled across every llm hop of every run.
  const outByModel = new Map<string, number[]>();

  for (const r of runs) {
    const visits = new Map<string, number>();
    for (const h of r.timeline!) {
      if (h.node) visits.set(h.node, (visits.get(h.node) ?? 0) + 1);
      if (h.kind === "llm" && h.model && typeof h.tokens_out === "number" && h.tokens_out > 0) {
        (outByModel.get(h.model) ?? outByModel.set(h.model, []).get(h.model)!).push(h.tokens_out);
      }
    }
    perRunMaxVisits.push(Math.max(1, ...visits.values()));
  }

  perRunMaxVisits.sort((a, b) => a - b);
  const loopP50 = Math.max(1, Math.round(pct(perRunMaxVisits, 0.5)));
  const loopP95 = Math.max(loopP50, Math.round(pct(perRunMaxVisits, 0.95)));

  const perModelOutputTokens: NonNullable<ForecastAssumptions["perModelOutputTokens"]> = {};
  for (const [model, toks] of outByModel) {
    toks.sort((a, b) => a - b);
    const p50 = Math.max(1, Math.round(pct(toks, 0.5)));
    perModelOutputTokens[model] = { p50, p95: Math.max(p50, Math.round(pct(toks, 0.95))) };
  }

  return {
    runs: runs.length,
    loopIterationsP50: loopP50,
    loopIterationsP95: loopP95,
    ...(Object.keys(perModelOutputTokens).length ? { perModelOutputTokens } : {}),
  };
}
