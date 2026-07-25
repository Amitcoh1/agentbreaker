"use client";

import type { GraphSpec } from "@/lib/graphspec";
import { perCallUsd, usd } from "@/lib/pricing";
import type { Forecast } from "@/lib/forecast";

// The signature panel: root budget -> per-node allocations -> unallocated remainder, now with
// live cost estimates from the price table (this is the budget-first differentiator).
export default function BudgetTree({
  spec,
  forecast: fc,
  loopIters,
  onLoopIters,
}: {
  spec: GraphSpec;
  forecast: Forecast;
  loopIters: number;
  onLoopIters: (n: number) => void;
}) {
  const budget = spec.config?.budget_usd ?? 0;
  const models = (spec.nodes ?? []).filter((n) => n.type === "model");
  const allocated = models.reduce((a, n) => a + (n.sub_budget_usd ?? 0), 0);
  const remaining = budget - allocated;
  const over = remaining < -1e-9;
  const overForecast = fc.reachable && budget > 0 && fc.totalP95 > budget;
  const pct = (v: number) => (budget > 0 ? Math.min(100, Math.max(0, (v / budget) * 100)) : 0);

  return (
    <div className={`card p-4 ${over ? "ring-1 ring-bad" : ""}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold">Budget tree</span>
        <span className="num text-2xl font-bold">${budget.toFixed(2)}</span>
      </div>
      <div className="space-y-2.5">
        {models.length === 0 && <div className="text-xs text-muted">No model nodes yet.</div>}
        {models.map((n) => {
          const sub = n.sub_budget_usd ?? 0;
          const perCall = perCallUsd(n.model, n.max_tokens);
          const calls = perCall && perCall > 0 && sub > 0 ? Math.floor(sub / perCall) : null;
          return (
            <div key={n.id}>
              <div className="flex justify-between text-xs">
                <span className="truncate">{n.id}</span>
                <span className="num">${sub.toFixed(2)}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-ink/5">
                <div className="h-2 rounded bg-primary" style={{ width: `${pct(sub)}%` }} />
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {perCall != null ? (
                  <>
                    ≈{usd(perCall)}/call{calls != null && ` · ~${calls} calls`}
                  </>
                ) : (
                  "unknown model — set a priced model for an estimate"
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className={`mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold ${
          over ? "text-bad" : "text-good"
        }`}
      >
        <span>{over ? "over-allocated" : "unallocated"}</span>
        <span className="num">${remaining.toFixed(2)}</span>
      </div>
      {fc.reachable && (fc.totalP95 > 0 || fc.unknownModels.length > 0) && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              Forecast <span className="font-normal text-muted">· est.</span>
            </span>
            <span className="num" style={overForecast ? { color: "#b8860b" } : undefined}>
              {usd(fc.totalP50)}–{usd(fc.totalP95)}
            </span>
          </div>
          <div className="mt-1 h-2 rounded bg-ink/5">
            <div
              className={`h-2 rounded ${overForecast ? "" : "bg-primary"}`}
              style={{
                width: `${budget > 0 ? Math.min(100, (fc.totalP95 / budget) * 100) : 0}%`,
                ...(overForecast ? { background: "#b8860b" } : {}),
              }}
            />
          </div>
          {overForecast && (
            <div className="mt-1 text-[11px] leading-snug" style={{ color: "#b8860b" }}>
              Bad-case (p95) forecast exceeds the ${budget.toFixed(2)} budget — a loop could run away.
              Estimate only, not a block.
            </div>
          )}
          {fc.unknownModels.length > 0 && (
            <div className="mt-1 text-[11px] text-muted">
              {fc.unknownModels.length} node(s) excluded (unpriced model).
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            <span className="whitespace-nowrap">loops ≈ {loopIters}×</span>
            <input
              type="range"
              min={1}
              max={12}
              value={loopIters}
              onChange={(e) => onLoopIters(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="assumed loop iterations"
            />
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted">
            Typical (p50) → bad-case (p95). Heuristic: loops ×{loopIters}–
            {Math.max(8, Math.round((loopIters * 8) / 3))}, output 60–100% of max_tokens.
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Per-call ≈ 1000 input tokens + max output at the model rate. Real input varies.
      </p>
    </div>
  );
}
