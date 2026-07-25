import { describe, it, expect } from "vitest";
import { forecast, DEFAULT_ASSUMPTIONS } from "./forecast";
import { perCallUsd, MODEL_NAMES } from "./pricing";
import type { GraphSpec } from "./graphspec";

// Pick a real priced model with a nonzero per-call cost, so tests don't hardcode a name that
// could drift out of the price table.
const M = MODEL_NAMES.find((m) => (perCallUsd(m, 1000) ?? 0) > 0)!;

const spec = (nodes: GraphSpec["nodes"], edges: GraphSpec["edges"]): GraphSpec => ({
  config: { budget_usd: 5 },
  nodes,
  edges,
});
const model = (id: string, max_tokens = 1024, m = M) => ({ id, type: "model" as const, model: m, max_tokens });

describe("forecast", () => {
  it("has no forecast without a start node", () => {
    const fc = forecast(spec([model("a")], []));
    expect(fc.reachable).toBe(false);
    expect(fc.totalP50).toBe(0);
  });

  it("linear graph: one call, not looped, p95 band above p50", () => {
    const fc = forecast(
      spec(
        [{ id: "s", type: "start" }, model("a"), { id: "e", type: "end" }],
        [{ source: "s", target: "a" }, { source: "a", target: "e" }],
      ),
    );
    expect(fc.reachable).toBe(true);
    expect(fc.perNode.a.calls).toBe(1);
    expect(fc.perNode.a.looped).toBe(false);
    expect(fc.perNode.a.p50!).toBeGreaterThan(0);
    // p95 uses full max_tokens vs 60% for p50 → strictly higher
    expect(fc.perNode.a.p95!).toBeGreaterThan(fc.perNode.a.p50!);
    expect(fc.totalP95).toBeGreaterThan(fc.totalP50);
  });

  it("router splits flow evenly across its branches", () => {
    const fc = forecast(
      spec(
        [
          { id: "s", type: "start" },
          { id: "r", type: "router", condition: "route" },
          model("a"),
          model("b"),
          { id: "e", type: "end" },
        ],
        [
          { source: "s", target: "r" },
          { source: "r", target: "a", condition: "x" },
          { source: "r", target: "b", condition: "y" },
          { source: "a", target: "e" },
          { source: "b", target: "e" },
        ],
      ),
    );
    expect(fc.perNode.a.calls).toBeCloseTo(0.5);
    expect(fc.perNode.b.calls).toBeCloseTo(0.5);
  });

  it("a loop multiplies the node's expected cost (the tail)", () => {
    // s -> a(model) -> r(router) -> a (back)  and r -> e
    const looped = forecast(
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
      ),
    );
    expect(looped.perNode.a.looped).toBe(true);
    // p50 uses ×3, p95 uses ×8 → p95 well above p50 (loop + output both push up)
    expect(looped.perNode.a.p95!).toBeGreaterThan(looped.perNode.a.p50! * 2);

    // same node without the back-edge costs strictly less
    const linear = forecast(
      spec(
        [{ id: "s", type: "start" }, model("a"), { id: "e", type: "end" }],
        [{ source: "s", target: "a" }, { source: "a", target: "e" }],
      ),
    );
    expect(looped.perNode.a.p50!).toBeGreaterThan(linear.perNode.a.p50!);
    // loop p50 applies ×3 vs ×1
    expect(looped.perNode.a.p50!).toBeCloseTo(linear.perNode.a.p50! * DEFAULT_ASSUMPTIONS.loopIterationsP50);
  });

  it("unknown model is flagged and excluded from totals", () => {
    const fc = forecast(
      spec(
        [{ id: "s", type: "start" }, { id: "u", type: "model", model: "nope/not-a-real-model", max_tokens: 512 }, { id: "e", type: "end" }],
        [{ source: "s", target: "u" }, { source: "u", target: "e" }],
      ),
    );
    expect(fc.perNode.u.knownModel).toBe(false);
    expect(fc.perNode.u.p50).toBeNull();
    expect(fc.unknownModels).toContain("u");
    expect(fc.totalP50).toBe(0);
  });

  it("a per-node model override changes that node's cost (what-if preview)", () => {
    const priced = MODEL_NAMES.filter((m) => (perCallUsd(m, 1024) ?? 0) > 0);
    const m1 = priced[0];
    const m2 = priced.find((m) => perCallUsd(m, 1024) !== perCallUsd(m1, 1024)) ?? priced[1];
    const g = spec(
      [{ id: "s", type: "start" }, model("a", 1024, m1), { id: "e", type: "end" }],
      [{ source: "s", target: "a" }, { source: "a", target: "e" }],
    );
    const base = forecast(g);
    const preview = forecast(g, { ...DEFAULT_ASSUMPTIONS, modelOverrides: { a: m2 } });
    expect(preview.perNode.a.p50).not.toBe(base.perNode.a.p50);
    expect(preview.perNode.a.p50!).toBeCloseTo(
      perCallUsd(m2, Math.round(1024 * DEFAULT_ASSUMPTIONS.outputFractionP50))!,
    );
  });
});
