"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GraphSpec } from "@/lib/graphspec";
import { simulate, routerOptions, type StopReason } from "@/lib/dryrun";
import { usd } from "@/lib/pricing";

// Codegen-safe "Playground": a simulated walk of the graph (no model calls, no keys). Answers
// Langflow's Playground without server execution — you see the path, per-hop cost and where the
// budget would trip, before running anything. Tools are stubbed (their Python isn't executed here).
const STOP: Record<StopReason, string> = {
  end: "reached the end",
  budget: "stopped — would exceed budget",
  max_hops: "stopped — hit max_hops",
  "no-start": "no start node",
  "dead-end": "dead end — a node has no outgoing edge",
};

export default function DryRunPlayground({ spec, onClose }: { spec: GraphSpec; onClose: () => void }) {
  const [routeChoices, setRouteChoices] = useState<Record<string, string>>({});
  const result = useMemo(() => simulate(spec, { routeChoices }), [spec, routeChoices]);
  const routers = (spec.nodes ?? []).filter((n) => n.type === "router");
  const budget = spec.config?.budget_usd ?? 0;
  const over = result.stop === "budget";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">
              Dry run <span className="font-normal text-muted">· mock</span>
            </div>
            <div className="text-[11px] leading-snug text-muted">
              A simulated path — no model calls, no keys. Tools are stubbed (their code isn&apos;t run).
              An estimate, not a real run.
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-4">
          {routers.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted">Pick each router&apos;s branch to explore a path:</div>
              {routers.map((r) => {
                const opts = routerOptions(spec, r.id);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="whitespace-nowrap text-muted">{r.id} →</span>
                    <select
                      className="rounded border border-border bg-surface px-2 py-1 text-xs"
                      value={routeChoices[r.id] ?? opts[0]?.target ?? ""}
                      onChange={(e) => setRouteChoices((c) => ({ ...c, [r.id]: e.target.value }))}
                    >
                      {opts.map((o) => (
                        <option key={o.target} value={o.target}>
                          {o.label ? `${o.label} → ${o.target}` : o.target}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <ol className="space-y-1">
            {result.trace.map((h, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="num text-muted">{i + 1}</span>
                  <span className="font-medium">{h.nodeId}</span>
                  <span className="text-muted">{h.type}</span>
                  {h.routeLabel && <span className="text-muted">→ {h.routeLabel}</span>}
                  {h.sideEffecting && <span style={{ color: "#b8860b" }}>side-effecting</span>}
                  {h.note && <span className="italic text-muted">{h.note}</span>}
                </span>
                <span className="num">{h.usd > 0 ? usd(h.usd) : "—"}</span>
              </li>
            ))}
            {result.trace.length === 0 && <li className="text-xs text-muted">No hops taken.</li>}
          </ol>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted" style={over ? { color: "#b8860b" } : undefined}>
            {STOP[result.stop]} · {result.hops} hop{result.hops === 1 ? "" : "s"}
          </span>
          <span className="num font-semibold" style={over ? { color: "#b8860b" } : undefined}>
            {usd(result.totalUsd)}
            {budget > 0 && <span className="text-muted"> / {usd(budget)}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
