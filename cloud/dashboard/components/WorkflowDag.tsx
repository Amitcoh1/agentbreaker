"use client";

import { useMemo } from "react";
import { Background, Controls, type Edge, type Node, ReactFlow } from "@xyflow/react";
import { microToUsd, usd } from "@/lib/format";
import type { RunEvent } from "@/lib/supabase";

function NodeLabel({
  name,
  cost,
  calls,
  trip,
}: {
  name: string;
  cost: string;
  calls: number;
  trip: boolean;
}) {
  return (
    <div className="px-3 py-2 text-left">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{name}</span>
        {trip && <span className="chip bg-bad/20 text-bad">stopped</span>}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
        <span className="num text-primary">{cost}</span>
        <span className="num">×{calls}</span>
      </div>
    </div>
  );
}

function build(events: RunEvent[]): { nodes: Node[]; edges: Edge[] } {
  const hops = events.filter((e) => e.type === "reconcile" || e.type === "tool_call");
  if (!hops.length) return { nodes: [], edges: [] };

  const order: string[] = [];
  const cost: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const h of hops) {
    const n = h.node ?? "?";
    if (!(n in cost)) {
      order.push(n);
      cost[n] = 0;
      count[n] = 0;
    }
    cost[n] += h.actual_microusd ?? 0;
    count[n] += 1;
  }
  const maxCost = Math.max(...Object.values(cost), 1);
  const stopped = events.some((e) => e.type === "trip");
  const tripNode = stopped ? (hops[hops.length - 1]?.node ?? null) : null;

  const nodes: Node[] = order.map((n, i) => {
    const isTrip = n === tripNode;
    const intensity = 0.2 + 0.6 * (cost[n] / maxCost);
    return {
      id: n,
      position: { x: i * 240, y: 80 },
      data: { label: <NodeLabel name={n} cost={usd(microToUsd(cost[n]))} calls={count[n]} trip={isTrip} /> },
      style: {
        background: "#fbfaf7",
        border: `1px solid ${isTrip ? "#b8860b" : `rgba(59,130,246,${intensity})`}`,
        borderRadius: 12,
        padding: 0,
        width: 200,
        color: "#1f2328",
      },
    };
  });

  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (let i = 1; i < hops.length; i++) {
    const a = hops[i - 1].node ?? "?";
    const b = hops[i].node ?? "?";
    if (a === b) continue;
    const id = `${a}->${b}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: a, target: b, animated: true, style: { stroke: "#1f2328" } });
  }
  return { nodes, edges };
}

export default function WorkflowDag({ events }: { events: RunEvent[] }) {
  const { nodes, edges } = useMemo(() => build(events), [events]);
  if (!nodes.length) {
    return <div className="card p-8 text-center text-sm text-muted">No hops recorded yet.</div>;
  }
  return (
    <div className="card h-[440px] overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.2}
      >
        <Background color="#e6e3da" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
