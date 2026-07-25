import { describe, it, expect } from "vitest";
import { costCeiling } from "./costCeiling";
import { perCallUsd, MODEL_NAMES } from "./pricing";
import type { GraphSpec } from "./graphspec";

const M = MODEL_NAMES.find((m) => (perCallUsd(m, 1000) ?? 0) > 0)!;
const spec = (
  nodes: GraphSpec["nodes"],
  edges: GraphSpec["edges"],
  config: GraphSpec["config"] = { budget_usd: 5, max_hops: 20 },
): GraphSpec => ({ config, nodes, edges });
const model = (id: string, max_tokens = 1024) => ({ id, type: "model" as const, model: M, max_tokens });

describe("costCeiling", () => {
  it("returns no bound when there's no start node", () => {
    const c = costCeiling(spec([model("a")], []));
    expect(c.ceiling).toBeNull();
    expect(c.bounded).toBe(false);
  });

  it("acyclic graph: ceiling is the sum of reachable model worst-cases", () => {
    const c = costCeiling(
      spec(
        [{ id: "s", type: "start" }, model("a"), model("b"), { id: "e", type: "end" }],
        [
          { source: "s", target: "a" },
          { source: "a", target: "b" },
          { source: "b", target: "e" },
        ],
      ),
    );
    expect(c.basis).toBe("dag-sum");
    expect(c.bounded).toBe(true);
    const one = perCallUsd(M, 1024)!;
    expect(c.ceiling).toBeCloseTo(one * 2);
  });

  it("excludes unreachable nodes from the bound", () => {
    const c = costCeiling(
      spec(
        [
          { id: "s", type: "start" },
          model("a"),
          model("orphan"),
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "a" },
          { source: "a", target: "e" },
        ],
      ),
    );
    expect(c.ceiling).toBeCloseTo(perCallUsd(M, 1024)!); // only "a", not "orphan"
  });

  it("looped graph: ceiling = max_hops × the costliest single hop", () => {
    const c = costCeiling(
      spec(
        [
          { id: "s", type: "start" },
          model("a"),
          { id: "r", type: "router", condition: "again" },
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "a" },
          { source: "a", target: "r" },
          { source: "r", target: "a", condition: "loop" },
          { source: "r", target: "e", condition: "done" },
        ],
        { budget_usd: 1000, max_hops: 10 },
      ),
    );
    expect(c.basis).toBe("hops-cap");
    expect(c.bounded).toBe(true);
    expect(c.ceiling).toBeCloseTo(perCallUsd(M, 1024)! * 10);
  });

  it("looped graph with no max_hops is unbounded (only the budget stops it)", () => {
    const c = costCeiling(
      spec(
        [
          { id: "s", type: "start" },
          model("a"),
          { id: "r", type: "router", condition: "again" },
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "a" },
          { source: "a", target: "r" },
          { source: "r", target: "a", condition: "loop" },
          { source: "r", target: "e", condition: "done" },
        ],
        { budget_usd: 5 }, // no max_hops
      ),
    );
    expect(c.ceiling).toBeNull();
    expect(c.bounded).toBe(false);
  });

  it("flags when the budget is the binding cap (budget < structural ceiling)", () => {
    // a big max_hops loop → structural ceiling far above a small budget
    const c = costCeiling(
      spec(
        [
          { id: "s", type: "start" },
          model("a"),
          { id: "r", type: "router", condition: "again" },
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "a" },
          { source: "a", target: "r" },
          { source: "r", target: "a", condition: "loop" },
          { source: "r", target: "e", condition: "done" },
        ],
        { budget_usd: 0.01, max_hops: 100 },
      ),
    );
    expect(c.budgetBinds).toBe(true);
  });

  it("lists unpriced reachable models (bound excludes them)", () => {
    const c = costCeiling(
      spec(
        [
          { id: "s", type: "start" },
          { id: "a", type: "model", model: "made-up/not-in-price-table", max_tokens: 1024 },
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "a" },
          { source: "a", target: "e" },
        ],
      ),
    );
    expect(c.unpricedModels).toContain("a");
  });
});
