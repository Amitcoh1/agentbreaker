// Codegen-safe "dry run": a pure, no-network simulation of one execution path through the graph.
// The generated artifact is Python (can't run in the browser), so this doesn't execute anything —
// it walks the spec (start → edges → routers → loops), accounts cost like the guard's reserve
// (block the hop that would cross the budget), and stops at max_hops. Tool nodes run arbitrary
// Python, so they're never executed here — they're stubbed and their side-effect flag surfaced.
//
// Mock mode uses this directly. Live BYO-key mode (later) reuses the same walk but fills model
// hops with real calls + real token usage.
import type { GraphSpec, SpecNode } from "./graphspec";
import { perCallUsd } from "./pricing";
import { DEFAULT_ASSUMPTIONS } from "./forecast";

export interface DryHop {
  nodeId: string;
  type: SpecNode["type"];
  model?: string;
  usd: number; // 0 for non-model / unpriced
  sideEffecting?: boolean; // tool nodes
  stubbed?: boolean; // tool nodes (not executed) or mock model output
  routeLabel?: string; // router: the branch label taken
  note?: string;
}

export type StopReason = "end" | "budget" | "max_hops" | "no-start" | "dead-end";

export interface DryResult {
  trace: DryHop[];
  stop: StopReason;
  totalUsd: number;
  hops: number;
}

export interface DryOptions {
  /** routerNodeId -> chosen target nodeId; defaults to the first outgoing branch */
  routeChoices?: Record<string, string>;
  /** fraction of max_tokens used for a model hop's cost (defaults to the forecast p50) */
  outputFraction?: number;
  /** absolute safety cap on total steps (defense against malformed graphs) */
  maxSteps?: number;
}

/** The outgoing branches of a router node, for the UI's per-router picker. */
export function routerOptions(spec: GraphSpec, nodeId: string): { label: string; target: string }[] {
  return (spec.edges ?? [])
    .filter((e) => e.source === nodeId)
    .map((e) => ({ label: e.condition ?? "", target: e.target }));
}

/** Simulate one execution path. Pure: same inputs → same result, no I/O. */
export function simulate(spec: GraphSpec, opts: DryOptions = {}): DryResult {
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type === "start");
  const trace: DryHop[] = [];
  let total = 0;
  let hops = 0;
  if (!start) return { trace, stop: "no-start", totalUsd: 0, hops: 0 };

  const outEdges = (id: string) => edges.filter((e) => e.source === id);
  const budget = spec.config?.budget_usd ?? Infinity;
  const maxHops = spec.config?.max_hops ?? 50;
  const outFrac = opts.outputFraction ?? DEFAULT_ASSUMPTIONS.outputFractionP50;
  const hardCap = opts.maxSteps ?? 2000;

  let current = start.id;
  for (let steps = 0; steps < hardCap; steps++) {
    const node = byId.get(current);
    if (!node) return { trace, stop: "dead-end", totalUsd: total, hops };
    if (node.type === "end") return { trace, stop: "end", totalUsd: total, hops };

    const outs = outEdges(current);
    if (node.type === "start") {
      if (!outs.length) return { trace, stop: "dead-end", totalUsd: total, hops };
      current = outs[0].target;
      continue;
    }

    // model / tool / router each count as a hop
    if (hops >= maxHops) return { trace, stop: "max_hops", totalUsd: total, hops };

    if (node.type === "model") {
      const per = perCallUsd(node.model, Math.round((node.max_tokens ?? 1024) * outFrac));
      const usd = per ?? 0;
      if (total + usd > budget) return { trace, stop: "budget", totalUsd: total, hops };
      total += usd;
      hops++;
      trace.push({
        nodeId: current,
        type: "model",
        model: node.model,
        usd,
        stubbed: true,
        note: per == null ? "unpriced model" : undefined,
      });
    } else if (node.type === "tool") {
      hops++;
      trace.push({
        nodeId: current,
        type: "tool",
        usd: 0,
        sideEffecting: !!node.side_effecting,
        stubbed: true,
        note: "not executed in dry-run",
      });
    } else if (node.type === "router") {
      hops++;
      const branches = routerOptions(spec, current);
      const chosen = opts.routeChoices?.[current] ?? branches[0]?.target;
      trace.push({
        nodeId: current,
        type: "router",
        usd: 0,
        routeLabel: branches.find((b) => b.target === chosen)?.label,
      });
      if (!chosen) return { trace, stop: "dead-end", totalUsd: total, hops };
      current = chosen;
      continue;
    }

    if (node.type === "model" || node.type === "tool") {
      if (!outs.length) return { trace, stop: "dead-end", totalUsd: total, hops };
      current = outs[0].target;
    }
  }
  return { trace, stop: "max_hops", totalUsd: total, hops };
}
