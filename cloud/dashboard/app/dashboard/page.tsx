import { Activity, Coins, Gauge, PiggyBank } from "lucide-react";
import { ChartCard, SpendOverTime } from "@/components/Charts";
import { EmptyState } from "@/components/EmptyState";
import { RunsTable } from "@/components/RunsTable";
import { StatCard, StatGrid } from "@/components/StatCard";
import { microToUsd, usd } from "@/lib/format";
import {
  isActive,
  type DailySpend,
  type Run,
  type SpendByModel as SBM,
  type SpendByNode as SBN,
} from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A compact "top cost drivers" list — replaces two full recharts panels with one glanceable
// ranked list per dimension (node, model). Bars are plain divs; no chart runtime needed.
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

export default async function Overview() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const [{ data: runs }, { data: byModel }, { data: daily }, { data: byNode }] = await Promise.all([
    db
      .from("runs")
      .select("*")
      .eq("owner_id", user?.id ?? "")
      .order("updated_at", { ascending: false })
      .limit(50),
    db.from("v_spend_by_model").select("*"),
    db.from("v_daily_spend").select("*"),
    db.from("v_spend_by_node").select("*"),
  ]);
  const rs = (runs ?? []) as Run[];
  if (rs.length === 0) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <header>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-sm text-muted">Cost across your guarded agent workflows.</p>
        </header>
        <EmptyState observe />
      </div>
    );
  }
  const spent = rs.reduce((a, r) => a + (r.spent_usd ?? 0), 0);
  const saved = rs.reduce((a, r) => a + (r.saved_usd ?? 0), 0);
  const active = rs.filter(isActive).length;
  const avertedPct = saved + spent > 0 ? (saved / (saved + spent)) * 100 : 0;

  // Budget utilization: of the dollars runs were allowed to spend, how many they used.
  const budgeted = rs.reduce((a, r) => a + (r.budget_usd ?? 0), 0);
  const utilPct = budgeted > 0 ? Math.min(999, (spent / budgeted) * 100) : 0;

  const topNodes = ((byNode ?? []) as SBN[])
    .slice(0, 5)
    .map((n) => ({ name: n.node, value: microToUsd(n.spent_microusd), meta: `${n.hops} hops` }));
  const topModels = ((byModel ?? []) as SBM[])
    .slice(0, 5)
    .map((m) => ({ name: m.model.split("/").pop() ?? m.model, value: microToUsd(m.spent_microusd), meta: `${m.calls} calls` }));

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted">Cost across your guarded agent workflows.</p>
      </header>

      <StatGrid>
        <StatCard label="Total spent" value={usd(spent)} sub={`across ${rs.length} runs`} icon={Coins} />
        <StatCard
          label="Waste averted"
          value={usd(saved)}
          sub={`${avertedPct.toFixed(0)}% of projected spend`}
          icon={PiggyBank}
        />
        <StatCard
          label="Active runs"
          value={String(active)}
          sub="currently guarded"
          icon={Activity}
          brass={active > 0}
        />
        <StatCard
          label="Budget used"
          value={budgeted > 0 ? `${utilPct.toFixed(0)}%` : "—"}
          sub={budgeted > 0 ? `${usd(spent)} of ${usd(budgeted)} allocated` : "no budgets set"}
          icon={Gauge}
        />
      </StatGrid>

      <ChartCard title="Spend over time" sub="daily, across public runs">
        <SpendOverTime data={(daily ?? []) as DailySpend[]} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top cost nodes" sub="where the money goes in the graph">
          <DriverList rows={topNodes} />
        </ChartCard>
        <ChartCard title="Spend by model" sub="which models cost the most">
          <DriverList rows={topModels} />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">Recent runs</h2>
        <RunsTable runs={rs.slice(0, 6)} />
      </section>
    </div>
  );
}
