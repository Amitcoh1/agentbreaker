"use client";

import { useEffect, useState } from "react";
import { money, supabase, type Run, type RunEvent } from "@/lib/supabase";

export default function Timeline({
  run,
  initialEvents,
}: {
  run: Run;
  initialEvents: RunEvent[];
}) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = supabase();
    const channel = db
      .channel(`events:${run.run_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `run_id=eq.${run.run_id}` },
        (payload) => {
          const row = payload.new as RunEvent;
          setEvents((prev) =>
            prev.some((e) => e.seq === row.seq) ? prev : [...prev, row].sort((a, b) => a.seq - b.seq),
          );
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [run.run_id]);

  const hops = events.filter((e) => e.type === "reconcile" || e.type === "tool_call");
  const usd = (m: number | null) => (m == null ? null : m / 1_000_000);

  return (
    <>
      <h1>
        run {run.run_id.slice(0, 8)}{" "}
        <span className={`status s-${run.status ?? "unknown"}`}>
          {run.status ?? "running"}
          {run.trip_reason ? ` · ${run.trip_reason}` : ""}
        </span>{" "}
        {live && <span className="live">● live</span>}
      </h1>

      <div className="headline">
        <div className="big">
          <span className="proj">{money(run.projected_uncapped_usd)}</span> &nbsp;→&nbsp;{" "}
          <span className="stop">{money(run.spent_usd)}</span>
        </div>
        <div className="muted">
          projected uncapped vs. spent · budget {money(run.budget_usd)} · {hops.length} hops
        </div>
      </div>

      {run.side_effects?.length > 0 && (
        <p className="se">⚠ Side-effecting tools fired: {run.side_effects.join(", ")}</p>
      )}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>node</th>
            <th>model</th>
            <th className="num">in</th>
            <th className="num">out</th>
            <th className="num">cost</th>
            <th className="num">cumulative</th>
          </tr>
        </thead>
        <tbody>
          {hops.map((e, i) => (
            <tr key={e.seq}>
              <td>{i + 1}</td>
              <td>
                {e.node}
                {e.side_effecting ? <span className="se"> side-effect</span> : ""}
              </td>
              <td className="muted">{e.model ?? e.type}</td>
              <td className="num">{e.tokens_in ?? ""}</td>
              <td className="num">{e.tokens_out ?? ""}</td>
              <td className="num">{money(usd(e.actual_microusd))}</td>
              <td className="num">{money(usd(e.cumulative_microusd))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
