import { describe, it, expect } from "vitest";
import { canConnect, duplicateFlow } from "./graphflow";
import type { FlowNode } from "./graphflow";
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

describe("duplicateFlow", () => {
  const fn = (id: string): FlowNode =>
    ({ id, type: "ab", position: { x: 0, y: 0 }, data: { spec: { id, type: "model" } } }) as FlowNode;

  it("clones nodes with fresh ids and remaps internal edges", () => {
    const { nodes, edges } = duplicateFlow(
      [fn("a"), fn("b")],
      [{ id: "a-b", source: "a", target: "b" }] as never,
      new Set(["a", "b"]),
    );
    expect(nodes.map((n) => n.id)).toEqual(["a_copy", "b_copy"]);
    expect(nodes[0].data.spec.id).toBe("a_copy");
    expect(nodes.every((n) => n.selected)).toBe(true);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("a_copy");
    expect(edges[0].target).toBe("b_copy");
  });

  it("drops edges that leave the copied set", () => {
    const { edges } = duplicateFlow([fn("a")], [{ id: "a-x", source: "a", target: "x" }] as never, new Set(["a"]));
    expect(edges).toHaveLength(0);
  });

  it("avoids id collisions with existing nodes", () => {
    const { nodes } = duplicateFlow([fn("a")], [], new Set(["a", "a_copy"]));
    expect(nodes[0].id).toBe("a_copy2");
  });
});
