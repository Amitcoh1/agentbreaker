import { Activity, Coins, Layers, PiggyBank } from "lucide-react";
import { AvertedGauge, ChartCard, SpendByModel, SpendOverTime, TopNodes } from "@/components/Charts";
import { RunsTable } from "@/components/RunsTable";
import { StatCard, StatGrid } from "@/components/StatCard";
import { usd } from "@/lib/format";
import {
  isActive,
  supabase,
  type DailySpend,
  type Run,
  type SpendByModel as SBM,
  type SpendByNode as SBN,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const db = supabase();
  const [{ data: runs }, { data: byModel }, { data: daily }, { data: byNode }] = await Promise.all([
    db.from("runs").select("*").order("updated_at", { ascending: false }).limit(50),
    db.from("v_spend_by_model").select("*"),
    db.from("v_daily_spend").select("*"),
    db.from("v_spend_by_node").select("*"),
  ]);
  const rs = (runs ?? []) as Run[];
  const spent = rs.reduce((a, r) => a + (r.spent_usd ?? 0), 0);
  const saved = rs.reduce((a, r) => a + (r.saved_usd ?? 0), 0);
  const active = rs.filter(isActive).length;
  const avertedPct = saved + spent > 0 ? (saved / (saved + spent)) * 100 : 0;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted">Cost across your guarded agent workflows.</p>
      </header>

      <StatGrid>
        <StatCard label="Total spent" value={usd(spent)} sub={`${rs.length} runs`} icon={Coins} tone="blue" />
        <StatCard
          label="Waste averted"
          value={usd(saved)}
          sub={`${avertedPct.toFixed(0)}% of projected`}
          icon={PiggyBank}
          tone="green"
        />
        <StatCard label="Active runs" value={String(active)} sub="currently guarded" icon={Activity} tone="amber" />
        <StatCard label="Runs" value={String(rs.length)} sub="most recent 50" icon={Layers} tone="blue" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Spend over time" sub="daily, public runs">
            <SpendOverTime data={(daily ?? []) as DailySpend[]} />
          </ChartCard>
        </div>
        <ChartCard title="Waste averted" sub="saved vs. projected">
          <AvertedGauge pct={avertedPct} saved={usd(saved)} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by model">
          <SpendByModel data={(byModel ?? []) as SBM[]} />
        </ChartCard>
        <ChartCard title="Top cost nodes">
          <TopNodes data={(byNode ?? []) as SBN[]} />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">Recent runs</h2>
        <RunsTable runs={rs.slice(0, 8)} />
      </section>
    </div>
  );
}
