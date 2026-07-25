import { describe, it, expect } from "vitest";
import { calibrate, type Receipt, type ReceiptHop } from "./calibration";
import { forecast, DEFAULT_ASSUMPTIONS } from "./forecast";
import type { GraphSpec } from "./graphspec";

const llm = (node: string, model: string, tokens_out: number): ReceiptHop => ({ kind: "llm", node, model, tokens_out });

const run = (run_id: string, hops: ReceiptHop[]): Receipt => ({ run_id, timeline: hops });

describe("calibrate", () => {
  it("returns no assumptions below minRuns (one run is an anecdote)", () => {
    const c = calibrate([run("a", [llm("plan", "openai/gpt-4o", 100)])], 2);
    expect(c.runs).toBe(1);
    expect(c.loopIterationsP50).toBeUndefined();
    expect(c.perModelOutputTokens).toBeUndefined();
  });

  it("dedupes by run_id (last wins) so re-uploads don't double-count", () => {
    const c = calibrate(
      [
        run("a", [llm("plan", "openai/gpt-4o", 100)]),
        run("a", [llm("plan", "openai/gpt-4o", 100)]), // same run uploaded twice
        run("b", [llm("plan", "openai/gpt-4o", 100)]),
      ],
      2,
    );
    expect(c.runs).toBe(2);
  });

  it("derives loop iterations from the most-repeated node per run", () => {
    // writer runs 3×, 3×, 5× across three runs → median 3, tail rounds to 5
    const w3 = [llm("plan", "m", 10), llm("write", "m", 10), llm("write", "m", 10), llm("write", "m", 10)];
    const w5 = [llm("write", "m", 10), llm("write", "m", 10), llm("write", "m", 10), llm("write", "m", 10), llm("write", "m", 10)];
    const c = calibrate([run("a", w3), run("b", w3), run("c", w5)], 2);
    expect(c.loopIterationsP50).toBe(3);
    expect(c.loopIterationsP95).toBe(5);
  });

  it("linear runs (no repeats) calibrate to a single pass", () => {
    const c = calibrate(
      [run("a", [llm("plan", "m", 10), llm("write", "m", 10)]), run("b", [llm("plan", "m", 10), llm("write", "m", 10)])],
      2,
    );
    expect(c.loopIterationsP50).toBe(1);
    expect(c.loopIterationsP95).toBe(1);
  });

  it("pools realized output tokens per model into a p50/p95", () => {
    const c = calibrate(
      [
        run("a", [llm("plan", "openai/gpt-4o", 100), llm("write", "openai/gpt-4o", 200)]),
        run("b", [llm("plan", "openai/gpt-4o", 300), llm("write", "openai/gpt-4o", 400)]),
      ],
      2,
    );
    const t = c.perModelOutputTokens!["openai/gpt-4o"];
    expect(t.p50).toBeGreaterThanOrEqual(100);
    expect(t.p50).toBeLessThanOrEqual(400);
    expect(t.p95).toBeGreaterThanOrEqual(t.p50);
    expect(t.p95).toBeLessThanOrEqual(400);
  });
});

describe("forecast uses calibration", () => {
  // A single model node with a big max_tokens reserve — the heuristic p95 uses the full cap.
  const spec: GraphSpec = {
    version: "1",
    config: { budget_usd: 10 },
    nodes: [
      { id: "start", type: "start" },
      { id: "m", type: "model", model: "openai/gpt-4o", max_tokens: 4096 },
      { id: "end", type: "end" },
    ],
    edges: [
      { source: "start", target: "m" },
      { source: "m", target: "end" },
    ],
  };

  it("narrows the p95 band when receipts show far fewer output tokens than the reserve", () => {
    const heuristic = forecast(spec, DEFAULT_ASSUMPTIONS);
    // Receipts: the model actually emits ~200 tokens, not the 4096 reserve.
    const cal = calibrate(
      [run("a", [llm("m", "openai/gpt-4o", 200)]), run("b", [llm("m", "openai/gpt-4o", 220)])],
      2,
    );
    const calibrated = forecast(spec, { ...DEFAULT_ASSUMPTIONS, perModelOutputTokens: cal.perModelOutputTokens });
    expect(calibrated.totalP95).toBeLessThan(heuristic.totalP95);
    expect(calibrated.totalP95).toBeGreaterThan(0);
  });
});
