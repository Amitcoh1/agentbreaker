"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CumulativeCost } from "@/components/Charts";
import RunControls from "@/components/RunControls";
import { StatusBadge } from "@/components/RunsTable";
import WorkflowDag from "@/components/WorkflowDag";
import { microToUsd, shortId, usd } from "@/lib/format";
import { displayStatus, supabase, type Run, type RunEvent } from "@/lib/supabase";

const TABS = ["Overview", "Timeline", "Workflow", "Events", "Controls"] as const;

export default function RunDetail({
  run: initialRun,
  initialEvents,
}: {
  run: Run;
  initialEvents: RunEvent[];
}) {
  const [run, setRun] = useState(initialRun);
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = supabase();
    const channel = db
      .channel(`run:${run.run_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `run_id=eq.${run.run_id}` },
        (payload) => {
          const row = payload.new as RunEvent;
          setEvents((prev) =>
            prev.some((e) => e.seq === row.seq)
              ? prev
              : [...prev, row].sort((a, b) => a.seq - b.seq),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs", filter: `run_id=eq.${run.run_id}` },
        (payload) => setRun((prev) => ({ ...prev, ...(payload.new as Run) })),
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [run.run_id]);

  const hops = useMemo(
    () => events.filter((e) => e.type === "reconcile" || e.type === "tool_call"),
    [events],
  );
  const cumulative = useMemo(
    () => hops.map((h, i) => ({ name: i + 1, spent: microToUsd(h.cumulative_microusd) })),
    [hops],
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <Link href="/runs" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Runs
        </Link>
        {live && (
          <span className="chip bg-good/15 text-good">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" /> live
          </span>
        )}
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="num text-lg font-semibold">run {shortId(run.run_id)}</h1>
        <StatusBadge status={displayStatus(run)} reason={run.trip_reason} />
      </header>

      <div className="card p-6 text-center">
        <div className="text-3xl font-semibold tracking-tight">
          <span className="num text-muted line-through">{usd(run.projected_uncapped_usd)}</span>
          <span className="mx-3 text-muted">→</span>
          <span className="num text-primary">{usd(run.spent_usd)}</span>
        </div>
        <div className="mt-2 text-xs text-muted">
          projected uncapped vs. spent · budget {usd(run.budget_usd)} · {hops.length} hops
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm transition-colors ${
              tab === t ? "border-b-2 border-primary text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab run={run} cumulative={cumulative} />}
      {tab === "Timeline" && <TimelineTab hops={hops} />}
      {tab === "Workflow" && <WorkflowDag events={events} />}
      {tab === "Events" && <EventsTab events={events} />}
      {tab === "Controls" && <RunControls run={run} events={events} />}
    </div>
  );
}

function OverviewTab({ run, cumulative }: { run: Run; cumulative: { name: number; spent: number }[] }) {
  const cells = [
    { k: "Budget", v: usd(run.budget_usd) },
    { k: "Spent", v: usd(run.spent_usd) },
    { k: "Saved", v: usd(run.saved_usd) },
    { k: "Hops", v: String(run.hops ?? "—") },
  ];
  return (
    <div className="space-y-4">
      {run.side_effects?.length > 0 && (
        <p className="text-sm font-semibold text-bad">
          ⚠ Side-effecting tools fired before the stop: {run.side_effects.join(", ")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.k} className="card p-4">
            <div className="text-xs text-muted">{c.k}</div>
            <div className="num mt-1 text-xl font-semibold">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Cumulative cost</div>
        <CumulativeCost points={cumulative} />
      </div>
    </div>
  );
}

function TimelineTab({ hops }: { hops: RunEvent[] }) {
  if (!hops.length) {
    return <div className="card p-8 text-center text-sm text-muted">No hops yet.</div>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left font-medium">#</th>
            <th className="px-4 py-3 text-left font-medium">Node</th>
            <th className="px-4 py-3 text-left font-medium">Model</th>
            <th className="px-4 py-3 text-right font-medium">In</th>
            <th className="px-4 py-3 text-right font-medium">Out</th>
            <th className="px-4 py-3 text-right font-medium">Cost</th>
            <th className="px-4 py-3 text-right font-medium">Cumulative</th>
          </tr>
        </thead>
        <tbody>
          {hops.map((h, i) => (
            <tr key={h.seq} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-2.5">{i + 1}</td>
              <td className="px-4 py-2.5">
                {h.node}
                {h.side_effecting && <span className="chip ml-2 bg-bad/15 text-bad">side-effect</span>}
              </td>
              <td className="px-4 py-2.5 text-muted">{h.model ?? h.type}</td>
              <td className="num px-4 py-2.5 text-right">{h.tokens_in ?? ""}</td>
              <td className="num px-4 py-2.5 text-right">{h.tokens_out ?? ""}</td>
              <td className="num px-4 py-2.5 text-right">{usd(microToUsd(h.actual_microusd))}</td>
              <td className="num px-4 py-2.5 text-right text-muted">
                {usd(microToUsd(h.cumulative_microusd))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsTab({ events }: { events: RunEvent[] }) {
  return (
    <div className="card num max-h-[520px] overflow-auto p-4 text-xs">
      {events.map((e) => (
        <div key={e.seq} className="flex gap-3 border-b border-border/50 py-1 last:border-0">
          <span className="w-8 text-muted">{e.seq}</span>
          <span className="w-28 text-primary">{e.type}</span>
          <span className="text-muted">{e.node ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
