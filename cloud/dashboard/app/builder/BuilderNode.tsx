"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Bot, Flag, GitBranch, Play, Wrench } from "lucide-react";
import type { SpecNode } from "@/lib/graphspec";

const META = {
  start: { icon: Play, color: "text-good" },
  end: { icon: Flag, color: "text-good" },
  model: { icon: Bot, color: "text-primary" },
  tool: { icon: Wrench, color: "text-accent" },
  router: { icon: GitBranch, color: "text-fg" },
} as const;

export default function BuilderNode({ data, selected }: NodeProps) {
  const n = (data as { spec: SpecNode }).spec;
  const m = META[n.type];
  const Icon = m.icon;
  return (
    <div className={`card min-w-[150px] px-3 py-2 ${selected ? "ring-2 ring-primary" : ""}`}>
      {n.type !== "start" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${m.color}`} />
        <span className="text-sm font-semibold">{n.id}</span>
      </div>
      <div className="mt-1 text-xs text-muted">
        {n.type === "model" && (
          <>
            {n.model} · {n.max_tokens ?? "no max_tokens"}
            {n.sub_budget_usd != null && ` · $${n.sub_budget_usd.toFixed(2)}`}
          </>
        )}
        {n.type === "tool" && (
          <>
            {n.name}
            {n.side_effecting ? " · side-effecting" : ""}
          </>
        )}
        {n.type === "router" && <>{n.condition}</>}
        {(n.type === "start" || n.type === "end") && n.type}
      </div>
      {n.type !== "end" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
