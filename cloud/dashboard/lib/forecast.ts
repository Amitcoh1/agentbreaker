// Design-time cost forecast for the builder — pure, no network, no execution.
//
// Turns the per-call estimate (pricing.ts) into an expected *run* cost by multiplying each model
// node's per-call cost by how many times it's expected to run, then aggregating. Cost is shown as a
// p50–p95 band because the tail (a loop that spins) is the whole point of a budget tool.
//
// This is advisory ONLY: it never touches codegen (see graphspec.ts), so the golden-fixture parity
// stays intact. Assumptions live here / in the caller, never in the exported spec.
//
// Heuristic, not a quote. Two dominant, explainable sources of variance:
//   - loop iterations:  p50 = few (default 3),  p95 = many (default 8)
//   - output tokens:    p50 = a fraction of max_tokens (0.6),  p95 = full max_tokens (the reserve cap)
// Router branches are split evenly across a router's outgoing edges (a first-order guess).
import type { GraphSpec, SpecNode, SpecEdge } from "./graphspec";
import { perCallUsd } from "./pricing";

export interface ForecastAssumptions {
  loopIterationsP50: number;
  loopIterationsP95: number;
  outputFractionP50: number; // fraction of max_tokens used for the p50 output estimate (p95 = 1.0)
  /** nodeId -> model, for what-if "try a different model here" previews (never committed to the spec) */
  modelOverrides?: Record<string, string>;
}

export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  loopIterationsP50: 3,
  loopIterationsP95: 8,
  outputFractionP50: 0.6,
};

export interface NodeForecast {
  calls: number; // expected calls on a single pass (before the loop multiplier), from flow splitting
  looped: boolean; // is this node inside a cycle?
  knownModel: boolean;
  p50: number | null; // USD; null when the model isn't in the price table
  p95: number | null;
}

export interface Forecast {
  perNode: Record<string, NodeForecast>;
  totalP50: number;
  totalP95: number;
  unknownModels: string[]; // model-node ids whose model isn't priced (excluded from totals)
  reachable: boolean; // false when there's no start node
}

const isRouter = (n: SpecNode) => n.type === "router";

/** Forecast the run cost of a graph. Pure: same inputs → same output, no I/O. */
export function forecast(spec: GraphSpec, a: ForecastAssumptions = DEFAULT_ASSUMPTIONS): Forecast {
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type === "start");

  const empty: Forecast = { perNode: {}, totalP50: 0, totalP95: 0, unknownModels: [], reachable: false };
  if (!start) return empty;

  const outAll = new Map<string, SpecEdge[]>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    (outAll.get(e.source) ?? outAll.set(e.source, []).get(e.source)!).push(e);
  }

  // --- back-edges (DFS gray-node test) so flow doesn't circulate forever ---
  const back = new Set<SpecEdge>();
  const color = new Map<string, 1 | 2>(); // 1=gray (on stack), 2=black (done)
  const dfs = (u: string) => {
    color.set(u, 1);
    for (const e of outAll.get(u) ?? []) {
      const c = color.get(e.target);
      if (c === 1) back.add(e);
      else if (c === undefined) dfs(e.target);
    }
    color.set(u, 2);
  };
  dfs(start.id);
  const fwdOut = new Map<string, SpecEdge[]>();
  for (const [id, es] of outAll) fwdOut.set(id, es.filter((e) => !back.has(e)));

  // --- looped nodes: a node is in a cycle iff it can reach itself over ALL edges ---
  const canReachSelf = (src: string): boolean => {
    const seen = new Set<string>();
    const stack = (outAll.get(src) ?? []).map((e) => e.target);
    while (stack.length) {
      const v = stack.pop()!;
      if (v === src) return true;
      if (seen.has(v)) continue;
      seen.add(v);
      for (const e of outAll.get(v) ?? []) stack.push(e.target);
    }
    return false;
  };
  const looped = new Set<string>();
  for (const n of nodes) if (canReachSelf(n.id)) looped.add(n.id);

  // --- flow propagation over the forward DAG (Kahn topological order) ---
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const es of fwdOut.values()) for (const e of es) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const flow = new Map<string, number>();
  flow.set(start.id, 1);
  const order: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const e of fwdOut.get(u) ?? []) {
      const d = (indeg.get(e.target) ?? 0) - 1;
      indeg.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  for (const u of order) {
    const f = flow.get(u) ?? 0;
    if (f === 0) continue;
    const es = fwdOut.get(u) ?? [];
    const node = byId.get(u)!;
    const w = isRouter(node) && es.length > 0 ? 1 / es.length : 1;
    for (const e of es) flow.set(e.target, (flow.get(e.target) ?? 0) + f * w);
  }

  // --- per-node cost (model nodes only) ---
  const perNode: Record<string, NodeForecast> = {};
  const unknownModels: string[] = [];
  let totalP50 = 0;
  let totalP95 = 0;
  for (const n of nodes) {
    if (n.type !== "model") continue;
    const calls = flow.get(n.id) ?? 0;
    if (calls === 0) continue; // unreachable from start
    const isLooped = looped.has(n.id);
    const model = a.modelOverrides?.[n.id] ?? n.model;
    const mt = n.max_tokens ?? 1024;
    const perP50 = perCallUsd(model, Math.round(mt * a.outputFractionP50));
    const perP95 = perCallUsd(model, mt);
    const known = perP50 != null && perP95 != null;
    const multP50 = isLooped ? a.loopIterationsP50 : 1;
    const multP95 = isLooped ? a.loopIterationsP95 : 1;
    const p50 = known ? perP50! * calls * multP50 : null;
    const p95 = known ? perP95! * calls * multP95 : null;
    perNode[n.id] = { calls, looped: isLooped, knownModel: known, p50, p95 };
    if (known) {
      totalP50 += p50!;
      totalP95 += p95!;
    } else {
      unknownModels.push(n.id);
    }
  }

  return { perNode, totalP50, totalP95, unknownModels, reachable: true };
}
