import { describe, it, expect } from "vitest";
import { canConnect } from "./graphflow";
import type { SpecNode } from "./graphspec";

const n = (id: string, type: SpecNode["type"]): SpecNode => ({ id, type });

describe("canConnect", () => {
  const s = n("s", "start");
  const a = n("a", "model");
  const b = n("b", "tool");
  const e = n("e", "end");

  it("allows a normal edge", () => {
    expect(canConnect(a, b, [])).toBe(true);
  });
  it("rejects an edge into a start node", () => {
    expect(canConnect(a, s, [])).toBe(false);
  });
  it("rejects an edge out of an end node", () => {
    expect(canConnect(e, a, [])).toBe(false);
  });
  it("rejects a self-loop", () => {
    expect(canConnect(a, a, [])).toBe(false);
  });
  it("rejects a duplicate edge", () => {
    expect(canConnect(a, b, [{ source: "a", target: "b" }])).toBe(false);
  });
  it("allows a back-edge that forms a loop (a→b exists, add b→a)", () => {
    expect(canConnect(b, a, [{ source: "a", target: "b" }])).toBe(true);
  });
  it("rejects when a node is missing", () => {
    expect(canConnect(undefined, b, [])).toBe(false);
  });
});
