import type { Edge, Node } from "@xyflow/react";
import type { GraphSpec, SpecEdge, SpecNode } from "./graphspec";

export type FlowNode = Node<{ spec: SpecNode }>;

function depths(nodes: SpecNode[], edges: SpecEdge[]): Record<string, number> {
  const start = nodes.find((n) => n.type === "start")?.id;
  const adj: Record<string, string[]> = {};
  for (const e of edges) (adj[e.source] ??= []).push(e.target);
  const depth: Record<string, number> = {};
  if (start) {
    const q = [start];
    depth[start] = 0;
    while (q.length) {
      const u = q.shift() as string;
      for (const v of adj[u] ?? []) if (!(v in depth)) { depth[v] = depth[u] + 1; q.push(v); }
    }
  }
  for (const n of nodes) if (!(n.id in depth)) depth[n.id] = 0;
  return depth;
}

// A simple layered left-to-right layout so an imported/loaded graph is legible immediately.
export function specToFlow(spec: GraphSpec): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  const depth = depths(nodes, edges);
  const perDepth: Record<number, number> = {};
  const fnodes: FlowNode[] = nodes.map((n) => {
    const d = depth[n.id] ?? 0;
    const row = (perDepth[d] = (perDepth[d] ?? 0) + 1) - 1;
    return { id: n.id, type: "ab", position: { x: d * 240, y: row * 120 + 40 }, data: { spec: n } };
  });
  const fedges: Edge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: e.condition,
    animated: true,
    style: { stroke: "#3B82F6" },
  }));
  return { nodes: fnodes, edges: fedges };
}

export function flowToSpec(fnodes: FlowNode[], fedges: Edge[], config: GraphSpec["config"]): GraphSpec {
  return {
    version: "1",
    config,
    nodes: fnodes.map((f) => f.data.spec),
    edges: fedges.map((e) => {
      const edge: SpecEdge = { source: e.source, target: e.target };
      if (e.label) edge.condition = String(e.label);
      return edge;
    }),
  };
}

let counter = 0;
export function newNode(type: SpecNode["type"], existing: Set<string>): SpecNode {
  let id: string = type;
  while (existing.has(id)) id = `${type}_${++counter}`;
  const base: SpecNode = { id, type };
  if (type === "model") return { ...base, model: "openai/gpt-4o", max_tokens: 1024 };
  if (type === "tool") return { ...base, name: "my_tool", side_effecting: false };
  if (type === "router") return { ...base, condition: "route" };
  return base;
}
