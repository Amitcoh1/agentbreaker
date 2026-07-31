import { AlertTriangle, Eye, ListChecks, PiggyBank } from "lucide-react";
import Link from "next/link";
import { ChartCard } from "@/components/Charts";
import { StatCard, StatGrid } from "@/components/StatCard";
import { microToUsd, shortId, usd } from "@/lib/format";
import { aggregateShadow, type ShadowEvent } from "@/lib/shadow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// #154b — "what would have tripped this week." Aggregates would_trip events from the owner's
// shadow-mode runs. Semantics mirror src/breakerbox/report/shadow.py exactly (see lib/shadow.ts —
// the source of truth is the Python module; lib/shadow.test.ts locks alignment). Read-only over the
// existing events table; RLS + runs!inner(owner_id) scope to the signed-in owner. Nothing is
// enforced in shadow — this page is the adoption on-ramp (VISION §3.3): see it before you enable it.

const WINDOW_DAYS = 7;

export default async function Shadow() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const ownerId = user?.id ?? "";
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data } = await db
    .from("events")
    .select("run_id,seq,type,cumulative_microusd,detail,ts,runs!inner(owner_id)")
    .eq("runs.owner_id", ownerId)
    .gte("ts", since)
    .limit(20_000);
  const s = aggregateShadow((data ?? []) as unknown as ShadowEvent[]);

  const reasons = Object.entries(s.by_reason).sort(([, a], [, b]) => b - a);
  const topReason = reasons[0]?.[0] ?? "—";
  const maxReason = reasons.reduce((m, [, n]) => Math.max(m, n), 0);
  const preventUsd = microToUsd(s.would_prevent_micro);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-lg font-semibold">Shadow report</h1>
        <p className="text-sm text-muted">
          What enforcement <em>would</em> have done — last {WINDOW_DAYS} days. Nothing was enforced.
        </p>
      </header>

      <StatGrid>
        <StatCard
          label="Would have tripped"
          value={`${s.runs_would_trip}/${s.runs_scanned}`}
          sub="runs"
          icon={Eye}
          brass={s.runs_would_trip > 0}
        />
        <StatCard
          label="Would have prevented"
          value={usd(preventUsd)}
          sub="spend after the first trip"
          icon={PiggyBank}
          brass={preventUsd > 0}
        />
        <StatCard label="Top reason" value={topReason} sub="most common would-trip" icon={AlertTriangle} />
        <StatCard label="Runs scanned" value={String(s.runs_scanned)} sub={`last ${WINDOW_DAYS} days`} icon={ListChecks} />
      </StatGrid>

      {s.runs_scanned === 0 ? (
        <div className="card p-6 text-sm text-muted">
          No runs in the last {WINDOW_DAYS} days. Start a run with{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">shadow=True</code> and its would-trip
          events will show up here.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Would-trip by reason" sub="what enforcement would have caught">
            {reasons.length === 0 ? (
              <div className="text-xs text-muted">Nothing would have tripped in this window.</div>
            ) : (
              <div className="space-y-2.5">
                {reasons.map(([reason, n]) => (
                  <div key={reason} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs" title={reason}>
                      {reason}
                    </span>
                    <div className="h-1.5 flex-1 rounded bg-ink/5">
                      <div
                        className="h-1.5 rounded bg-brass/70"
                        style={{ width: `${maxReason > 0 ? (n / maxReason) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="num w-10 shrink-0 text-right text-xs">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Top runs by prevented spend" sub="where enforcement would have saved the most">
            {s.top_runs.length === 0 ? (
              <div className="text-xs text-muted">No would-trips in this window.</div>
            ) : (
              <div className="space-y-2">
                {s.top_runs.map((r) => (
                  <div key={r.run_id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/dashboard/runs/${r.run_id}`} className="num text-xs underline-offset-2 hover:underline">
                      {shortId(r.run_id)}
                    </Link>
                    <span className="text-xs text-muted">{r.reason}</span>
                    <span className="num text-xs">{usd(microToUsd(r.prevented_micro))}</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      )}

      <div className="card space-y-2 p-5">
        <div className="text-sm font-semibold">Ready to graduate?</div>
        <p className="text-xs text-muted">
          Everything above is observe-only. When the numbers look right, turn enforcement on with a one-line
          change — drop <code className="rounded bg-ink/5 px-1.5 py-0.5">shadow=True</code> and pick an{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5">on_trip</code> action:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-ink/[0.04] p-3 text-xs">
          <code>{`# shadow — observe only
app = guard(compiled, budget_usd=5.00, shadow=True)

# enforce — the ceiling is now real
app = guard(compiled, budget_usd=5.00, on_trip="pause")`}</code>
        </pre>
      </div>
    </div>
  );
}
