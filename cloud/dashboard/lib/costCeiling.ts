// Provable worst-case cost ceiling (#79) — the headline: "this graph cannot cost more than $X",
// computed statically with ZERO API calls. Unlike the forecast (a p50–p95 *estimate*), this is an
// upper *bound*: every reachable model hop is charged at its full max_tokens, and a graph with a loop
// is charged max_hops of the single costliest hop. No competitor can print this — a gateway only
// knows cost after a request; a worst-case bound needs the whole graph topology at design time.
//
// Pure, no I/O. This powers the builder read-out now; emitting it into the generated Python (as a
// comment + assert) is a separate, byte-parity-locked change.
import type { GraphSpec } from "./graphspec";
import { perCallUsd } from "./pricing";

export interface CostCeiling {
  /** USD upper bound over priced, reachable model nodes. null when a reachable loop has no max_hops
   *  (unbounded unless the budget stops it). */
  ceiling: number | null;
  /** true when the graph is structurally bounded without relying on the budget to trip. */
  bounded: boolean;
  basis: "dag-sum" | "hops-cap" | "empty";
  maxHops: number | null;
  costliestHopUsd: number;
  /** reachable model nodes with no known price — the ceiling excludes them, so it's a lower bound on
   *  the true worst case until they're priced. */
  unpricedModels: string[];
  budgetUsd: number | null;
  /** budget < structural ceiling → the guard's budget is the effective cap (it's doing real work). */
  budgetBinds: boolean;
}

// Is there a cycle among the reachable nodes? (gray/black DFS over the reachable adjacency.)
function hasReachableCycle(reachable: Set<string>, adj: Map<string, string[]>): boolean {
  const color = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const visit = (u: string): boolean => {
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      if (!reachable.has(v)) continue;
      const c = color.get(v);
      if (c === 1) return true;
      if (c === undefined && visit(v)) return true;
    }
    color.set(u, 2);
    return false;
  };
  for (const n of reachable) if (color.get(n) === undefined && visit(n)) return true;
  return false;
}

export function costCeiling(spec: GraphSpec): CostCeiling {
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type === "start");
  const maxHops = spec.config?.max_hops ?? null;
  const budgetUsd = spec.config?.budget_usd ?? null;

  const base = {
    maxHops,
    costliestHopUsd: 0,
    unpricedModels: [] as string[],
    budgetUsd,
    budgetBinds: false,
  };
  if (!start) return { ...base, ceiling: null, bounded: false, basis: "empty" };

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (byId.has(e.source) && byId.has(e.target)) {
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    }
  }
  const reachable = new Set<string>();
  const stack = [start.id];
  while (stack.length) {
    const u = stack.pop()!;
    if (reachable.has(u)) continue;
    reachable.add(u);
    for (const v of adj.get(u) ?? []) stack.push(v);
  }

  let costliest = 0;
  let sum = 0;
  const unpricedModels: string[] = [];
  for (const id of reachable) {
    const n = byId.get(id)!;
    if (n.type !== "model") continue;
    const per = perCallUsd(n.model, n.max_tokens ?? 1024);
    if (per == null) {
      unpricedModels.push(id);
      continue;
    }
    costliest = Math.max(costliest, per);
    sum += per;
  }

  const budgetBinds = (ceiling: number | null) =>
    budgetUsd != null && ceiling != null && budgetUsd < ceiling;

  // No priced model cost anywhere → ceiling is $0 (still surface unpriced caveat).
  if (costliest === 0) {
    return { ...base, unpricedModels, ceiling: 0, bounded: true, basis: "empty" };
  }

  if (hasReachableCycle(reachable, adj)) {
    // A loop: worst case is max_hops of the costliest single hop. Without max_hops it's unbounded
    // (only the budget stops it) — report null + bounded:false so the UI says so honestly.
    const ceiling = maxHops != null ? maxHops * costliest : null;
    return {
      ...base,
      unpricedModels,
      costliestHopUsd: costliest,
      ceiling,
      bounded: ceiling != null,
      basis: "hops-cap",
      budgetBinds: budgetBinds(ceiling),
    };
  }

  // Acyclic: the worst path visits each reachable model node at most once → sum is an upper bound.
  return {
    ...base,
    unpricedModels,
    costliestHopUsd: costliest,
    ceiling: sum,
    bounded: true,
    basis: "dag-sum",
    budgetBinds: budgetBinds(sum),
  };
}
