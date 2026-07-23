"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CumulativeCost } from "@/components/Charts";
import RunControls from "@/components/RunControls";
import { StatusBadge } from "@/components/RunsTable";
import WorkflowDag from "@/components/WorkflowDag";
import { microToUsd, shortId, usd } from "@/lib/format";
import { displayStatus, type Run, type RunEvent } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TABS = ["Overview", "Timeline", "Workflow", "Logs", "Controls"] as const;

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
    const db = createSupabaseBrowserClient();
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

  const status = displayStatus(run);
  const tripped = status === "killed" || status === "paused";
  const spent = run.spent_usd ?? 0;
  const projected = run.projected_uncapped_usd ?? 0;
  const averted = projected - spent;
  // Only show the projection when it actually differs from what was spent — a completed run
  // that finished on its own has projected == spent, so the "projected → spent" framing is noise.
  const showProjection = averted > 0.0001;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/runs" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Runs
        </Link>
        {live && (
          <span className="chip bg-ink/[0.06] text-fg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" /> live
          </span>
        )}
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="num text-lg font-semibold">run {shortId(run.run_id)}</h1>
        <StatusBadge status={status} reason={run.trip_reason} />
      </header>

      <div className="card p-6 text-center">
        <div className="text-3xl font-semibold tracking-tight">
          <span className="text-muted">spent </span>
          <span className={`num ${tripped ? "text-brass" : "text-fg"}`}>{usd(spent)}</span>
        </div>
        <div className="mt-2 text-xs text-muted">
          budget {usd(run.budget_usd)} · {hops.length} hops · {status}
          {run.trip_reason ? ` (${run.trip_reason})` : ""}
        </div>
        {showProjection && (
          <div className="mt-1 text-xs text-muted">
            projected uncapped (naive linear extrapolation, likely an underestimate):{" "}
            <span className="num line-through">{usd(projected)}</span> · averted{" "}
            <span className="num">{usd(averted)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm transition-colors ${
              tab === t ? "border-b-2 border-ink text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab run={run} cumulative={cumulative} />}
      {tab === "Timeline" && <TimelineTab hops={hops} />}
      {tab === "Workflow" && <WorkflowDag events={events} />}
      {tab === "Logs" && <LogsTab events={events} />}
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
        <p className="text-sm font-semibold text-brass">
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
                {h.side_effecting && <span className="chip ml-2 bg-brass/15 text-brass">side-effect</span>}
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

// A real log stream: one monospace line per event, with the trip/overshoot/discrepancy detail
// we already store surfaced inline. No prompts or keys are ever in the event stream.
function LogsTab({ events }: { events: RunEvent[] }) {
  const [filter, setFilter] = useState("all");
  const types = useMemo(() => Array.from(new Set(events.map((e) => e.type))), [events]);
  const rows = filter === "all" ? events : events.filter((e) => e.type === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {["all", ...types].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`chip ${filter === t ? "bg-ink/[0.08] text-fg" : "bg-ink/[0.03] text-muted hover:text-fg"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="card num max-h-[560px] overflow-auto p-0 text-xs">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-muted">No events{filter === "all" ? " yet" : ` of type “${filter}”`}.</div>
        ) : (
          rows.map((e) => <LogLine key={e.seq} e={e} />)
        )}
      </div>
    </div>
  );
}

function LogLine({ e }: { e: RunEvent }) {
  const time = e.ts ? new Date(e.ts).toLocaleTimeString(undefined, { hour12: false }) : "";
  const alert = e.type === "trip" || e.type === "pause";
  const tokens =
    e.tokens_in != null || e.tokens_out != null ? `${e.tokens_in ?? 0}→${e.tokens_out ?? 0}` : null;
  const cost = e.actual_microusd != null ? usd(microToUsd(e.actual_microusd)) : null;
  const cum = e.cumulative_microusd != null ? usd(microToUsd(e.cumulative_microusd)) : null;

  const d = (e.detail ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  if (e.type === "trip") notes.push(`reason: ${String(d.reason ?? "?")}${d.on_trip ? ` · on_trip=${String(d.on_trip)}` : ""}`);
  if (e.type === "pause") notes.push(`reason: ${String(d.reason ?? "?")}`);
  if (e.type === "resume") notes.push(`+${usd(Number(d.extra_usd ?? 0))} budget`);
  if (e.type === "control") notes.push(`command: ${String(d.command ?? "?")}`);
  if (d.overshoot) notes.push("cap enforced one hop late — no max_tokens declared");
  if (d.discrepancy) notes.push(`meter Δ vs provider: ${JSON.stringify(d.discrepancy)}`);

  return (
    <div className="border-b border-border/50 px-4 py-1.5 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="w-8 shrink-0 text-right text-muted">{e.seq}</span>
        <span className="w-20 shrink-0 text-muted">{time}</span>
        <span className={`w-20 shrink-0 font-semibold ${alert ? "text-brass" : "text-fg"}`}>{e.type}</span>
        <span className="min-w-0 flex-1 truncate">
          {e.node}
          {e.model && <span className="text-muted"> · {e.model}</span>}
          {e.side_effecting && <span className="chip ml-2 bg-brass/15 text-brass">side-effect</span>}
        </span>
        {tokens && <span className="text-muted">{tokens} tok</span>}
        {cost && <span>{cost}</span>}
        {cum && <span className="text-muted">Σ {cum}</span>}
      </div>
      {notes.length > 0 && (
        <div className={`ml-[9.5rem] mt-0.5 ${alert ? "text-brass" : "italic text-muted"}`}>
          ↳ {notes.join(" · ")}
        </div>
      )}
    </div>
  );
}
