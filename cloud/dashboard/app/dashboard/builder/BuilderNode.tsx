"use client";

import { useContext } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Bot, Flag, GitBranch, Play, TriangleAlert, Wrench } from "lucide-react";
import type { SpecNode } from "@/lib/graphspec";
import { perCallUsd, usd } from "@/lib/pricing";
import { NodeForecasts, NodeIssues } from "./context";

const META = {
  start: { icon: Play, color: "text-good" },
  end: { icon: Flag, color: "text-good" },
  model: { icon: Bot, color: "text-primary" },
  tool: { icon: Wrench, color: "text-accent" },
  router: { icon: GitBranch, color: "text-fg" },
} as const;

export default function BuilderNode({ id, data, selected }: NodeProps) {
  const n = (data as { spec: SpecNode }).spec;
  const m = META[n.type];
  const Icon = m.icon;
  const issue = useContext(NodeIssues)[id];
  const nf = useContext(NodeForecasts)[id];
  const cost = n.type === "model" ? perCallUsd(n.model, n.max_tokens) : null;

  return (
    <div
      title={issue ?? ""}
      className={`card min-w-[150px] px-3 py-2 ${
        issue ? "ring-2 ring-bad" : selected ? "ring-2 ring-primary" : ""
      }`}
    >
      {n.type !== "start" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${m.color}`} />
        <span className="text-sm font-semibold">{n.id}</span>
        {issue && <TriangleAlert className="ml-auto h-3.5 w-3.5 text-bad" />}
      </div>
      <div className="mt-1 text-xs text-muted">
        {n.type === "model" && (
          <>
            {n.model} · {n.max_tokens ?? "no max_tokens"}
            {cost != null && <span className="text-primary"> · ≈{usd(cost)}/call</span>}
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
      {n.type === "model" && nf?.knownModel && (
        <div
          className={`mt-0.5 text-[11px] ${nf.looped ? "" : "text-muted"}`}
          style={nf.looped ? { color: "#b8860b" } : undefined}
          title={nf.looped ? "in a loop — cost multiplied" : "expected run cost (p50–p95)"}
        >
          {nf.looped ? "↻ " : ""}run ≈ {usd(nf.p50)}–{usd(nf.p95)}
        </div>
      )}
      {n.type !== "end" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
