import { describe, it, expect } from "vitest";
import { simulate, routerOptions } from "./dryrun";
import { perCallUsd, MODEL_NAMES } from "./pricing";
import type { GraphSpec } from "./graphspec";

const M = MODEL_NAMES.find((m) => (perCallUsd(m, 1000) ?? 0) > 0)!;
const spec = (
  nodes: GraphSpec["nodes"],
  edges: GraphSpec["edges"],
  config: GraphSpec["config"] = { budget_usd: 5, max_hops: 50 },
): GraphSpec => ({ config, nodes, edges });
const model = (id: string) => ({ id, type: "model" as const, model: M, max_tokens: 1024 });

describe("simulate", () => {
  it("reports no-start when there's no start node", () => {
    expect(simulate(spec([model("a")], [])).stop).toBe("no-start");
  });

  it("walks a linear graph to the end with one costed model hop", () => {
    const r = simulate(
      spec(
        [{ id: "s", type: "start" }, model("a"), { id: "e", type: "end" }],
        [{ source: "s", target: "a" }, { source: "a", target: "e" }],
      ),
    );
    expect(r.stop).toBe("end");
    expect(r.trace.map((h) => h.nodeId)).toEqual(["a"]);
    expect(r.hops).toBe(1);
    expect(r.totalUsd).toBeGreaterThan(0);
  });

  it("stubs tool nodes and surfaces their side-effect flag", () => {
    const r = simulate(
      spec(
        [
          { id: "s", type: "start" },
          { id: "t", type: "tool", name: "publish", side_effecting: true },
          { id: "e", type: "end" },
        ],
        [{ source: "s", target: "t" }, { source: "t", target: "e" }],
      ),
    );
    const hop = r.trace.find((h) => h.nodeId === "t")!;
    expect(hop.stubbed).toBe(true);
    expect(hop.sideEffecting).toBe(true);
    expect(hop.usd).toBe(0);
  });

  it("follows the chosen router branch (default = first)", () => {
    const g = spec(
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
    );
    expect(routerOptions(g, "r").map((o) => o.target)).toEqual(["a", "b"]);
    expect(simulate(g).trace.some((h) => h.nodeId === "a")).toBe(true); // default first
    const picked = simulate(g, { routeChoices: { r: "b" } });
    expect(picked.trace.some((h) => h.nodeId === "b")).toBe(true);
    expect(picked.trace.some((h) => h.nodeId === "a")).toBe(false);
  });

  it("stops at max_hops when a loop is chosen", () => {
    const g = spec(
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
      { budget_usd: 1000, max_hops: 6 },
    );
    const r = simulate(g, { routeChoices: { r: "a" } }); // always loop back
    expect(r.stop).toBe("max_hops");
    expect(r.hops).toBe(6);
  });

  it("stops at the budget before the hop that would cross it", () => {
    const g = spec(
      [{ id: "s", type: "start" }, model("a"), { id: "e", type: "end" }],
      [{ source: "s", target: "a" }, { source: "a", target: "e" }],
      { budget_usd: 0.000001, max_hops: 50 }, // below one model call
    );
    const r = simulate(g);
    expect(r.stop).toBe("budget");
    expect(r.trace).toHaveLength(0); // the crossing hop is blocked, not recorded
  });
});
