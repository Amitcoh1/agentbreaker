import { Boxes, Coins, Ruler, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ChartCard, SpendOverTime } from "@/components/Charts";
import { StatCard, StatGrid } from "@/components/StatCard";
import { microToUsd, shortId, usd } from "@/lib/format";
import type { DailySpend } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// #154a — the design partner's own spend, aggregated across runs by model / agent (node) / day,
// plus per-run drift (our meter's estimate vs. reconciled actual). Read-only over existing tables;
// RLS + the runs!inner(owner_id) filter scope every row to the signed-in owner. No edge fns, no new
// tables. Drift here is estimate-vs-actual from Breakerbox's own meter — NOT a billing reconciliation
// (that two-speed accounting is P2.1 / #155, deliberately not built here).

const WINDOW_DAYS = 30;

type EvRow = {
  run_id: string;
  model: string | null;
  node: string | null;
  ts: string | null;
  type: string;
  actual_microusd: number | null;
  estimate_microusd: number | null;
};

// Ranked bar list, mirroring the Overview's driver list (that one is page-local, not exported).
function DriverList({ rows }: { rows: { name: string; value: number; meta?: string }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  if (!rows.length) return <div className="text-xs text-muted">No spend recorded yet.</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs" title={r.name}>
            {r.name}
          </span>
          <div className="h-1.5 flex-1 rounded bg-ink/5">
            <div
              className="h-1.5 rounded bg-ink/70"
              style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }}
            />
          </div>
          {r.meta && <span className="w-14 shrink-0 text-right text-[11px] text-muted">{r.meta}</span>}
          <span className="num w-16 shrink-0 text-right text-xs">{usd(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Spend() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const ownerId = user?.id ?? "";
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // Events across the owner's runs in-window. The inner join on runs.owner_id scopes to this owner
  // (RLS alone would also expose other people's *public* runs — the filter keeps it to their own).
  const { data: evData } = await db
    .from("events")
    .select("run_id,model,node,ts,type,actual_microusd,estimate_microusd,runs!inner(owner_id)")
    .eq("runs.owner_id", ownerId)
    .gte("ts", since)
    .limit(20_000);
  const events = (evData ?? []) as unknown as EvRow[];

  const byModel = new Map<string, { spent: number; calls: number }>();
  const byNode = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byRun = new Map<string, { actual: number; estimate: number }>();
  let totalActual = 0;
  let totalEstimate = 0;

  for (const e of events) {
    const a = e.actual_microusd ?? 0;
    const est = e.estimate_microusd ?? 0;
    totalActual += a;
    totalEstimate += est;
    if (e.model) {
      const m = byModel.get(e.model) ?? { spent: 0, calls: 0 };
      m.spent += a;
      if (e.type === "reconcile") m.calls += 1;
      byModel.set(e.model, m);
    }
    if (e.node) byNode.set(e.node, (byNode.get(e.node) ?? 0) + a);
    if (e.ts) {
      const day = e.ts.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + a);
    }
    const r = byRun.get(e.run_id) ?? { actual: 0, estimate: 0 };
    r.actual += a;
    r.estimate += est;
    byRun.set(e.run_id, r);
  }

  const topModels = [...byModel.entries()]
    .map(([model, v]) => ({
      name: model.split("/").pop() ?? model,
      value: microToUsd(v.spent),
      meta: `${v.calls} calls`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const topNodes = [...byNode.entries()]
    .map(([node, micro]) => ({ name: node, value: microToUsd(micro) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, micro]) => ({ day, spent_usd: microToUsd(micro), runs: 0, saved_usd: 0 })) as DailySpend[];

  // Per-run drift, biggest absolute gap first — where our estimate diverged most from actual.
  const drift = [...byRun.entries()]
    .map(([run_id, v]) => {
      const actual = microToUsd(v.actual);
      const estimate = microToUsd(v.estimate);
      const delta = actual - estimate;
      return { run_id, actual, estimate, delta, pct: estimate > 0 ? (delta / estimate) * 100 : null };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 12);

  const totalSpent = microToUsd(totalActual);
  const totalDelta = microToUsd(totalActual - totalEstimate);
  const totalPct = totalEstimate > 0 ? (totalDelta / totalEstimate) * 100 : null;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-lg font-semibold">Spend</h1>
        <p className="text-sm text-muted">Your spend by model, agent, and day — last {WINDOW_DAYS} days.</p>
      </header>

      <StatGrid>
        <StatCard label="Spent" value={usd(totalSpent)} sub={`across ${byRun.size} runs`} icon={Coins} />
        <StatCard label="Estimated" value={usd(microToUsd(totalEstimate))} sub="reserved up front" icon={Ruler} />
        <StatCard
          label="Drift"
          value={usd(totalDelta)}
          sub={totalPct == null ? "no estimates yet" : `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}% vs estimate`}
          icon={TrendingUp}
          brass={totalPct != null && Math.abs(totalPct) >= 10}
        />
        <StatCard label="Models" value={String(byModel.size)} sub={`${byNode.size} agents`} icon={Boxes} />
      </StatGrid>

      <ChartCard title="Spend over time" sub={`daily, last ${WINDOW_DAYS} days`}>
        <SpendOverTime data={daily} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by model" sub="which models cost the most">
          <DriverList rows={topModels} />
        </ChartCard>
        <ChartCard title="Spend by agent" sub="where the money goes in the graph">
          <DriverList rows={topNodes} />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Per-run drift</h2>
          <p className="text-xs text-muted">
            Our meter&apos;s reserved estimate vs. reconciled actual — not a billing reconciliation. Biggest gaps first.
          </p>
        </div>
        <div className="card overflow-hidden">
          {drift.length === 0 ? (
            <div className="p-4 text-xs text-muted">No runs in the last {WINDOW_DAYS} days.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Run</th>
                  <th className="px-4 py-2 text-right font-medium">Estimate</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Drift</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {drift.map((d) => (
                  <tr key={d.run_id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/runs/${d.run_id}`} className="num text-xs underline-offset-2 hover:underline">
                        {shortId(d.run_id)}
                      </Link>
                    </td>
                    <td className="num px-4 py-2 text-right text-xs">{usd(d.estimate)}</td>
                    <td className="num px-4 py-2 text-right text-xs">{usd(d.actual)}</td>
                    <td className={`num px-4 py-2 text-right text-xs ${Math.abs(d.pct ?? 0) >= 10 ? "text-brass" : ""}`}>
                      {d.delta >= 0 ? "+" : ""}
                      {usd(d.delta)}
                    </td>
                    <td className="num px-4 py-2 text-right text-xs text-muted">
                      {d.pct == null ? "—" : `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
