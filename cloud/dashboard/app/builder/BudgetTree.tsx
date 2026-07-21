"use client";

import type { GraphSpec } from "@/lib/graphspec";

// The signature panel: root budget -> per-node allocations -> unallocated remainder.
// Over-allocation turns red; the page uses the same math to block export.
export default function BudgetTree({ spec }: { spec: GraphSpec }) {
  const budget = spec.config?.budget_usd ?? 0;
  const models = (spec.nodes ?? []).filter((n) => n.type === "model");
  const allocated = models.reduce((a, n) => a + (n.sub_budget_usd ?? 0), 0);
  const remaining = budget - allocated;
  const over = remaining < -1e-9;
  const pct = (v: number) => (budget > 0 ? Math.min(100, Math.max(0, (v / budget) * 100)) : 0);

  return (
    <div className={`card p-4 ${over ? "ring-1 ring-bad" : ""}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold">Budget tree</span>
        <span className="num text-2xl font-bold">${budget.toFixed(2)}</span>
      </div>
      <div className="space-y-2">
        {models.length === 0 && <div className="text-xs text-muted">No model nodes yet.</div>}
        {models.map((n) => (
          <div key={n.id}>
            <div className="flex justify-between text-xs">
              <span className="truncate">{n.id}</span>
              <span className="num">${(n.sub_budget_usd ?? 0).toFixed(2)}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-white/5">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: `${pct(n.sub_budget_usd ?? 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        className={`mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold ${
          over ? "text-bad" : "text-good"
        }`}
      >
        <span>{over ? "over-allocated" : "unallocated"}</span>
        <span className="num">${remaining.toFixed(2)}</span>
      </div>
    </div>
  );
}
