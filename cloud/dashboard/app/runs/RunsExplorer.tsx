"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { RunsTable } from "@/components/RunsTable";
import { displayStatus, supabase, type Run } from "@/lib/supabase";

const FILTERS = ["all", "running", "completed", "killed", "paused"] as const;

export default function RunsExplorer({ initial }: { initial: Run[] }) {
  const [runs, setRuns] = useState<Run[]>(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    const db = supabase();
    const channel = db
      .channel("runs-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, (payload) => {
        const row = payload.new as Run;
        if (!row?.run_id) return;
        setRuns((prev) => {
          const i = prev.findIndex((r) => r.run_id === row.run_id);
          if (i >= 0) {
            const copy = [...prev];
            copy[i] = { ...copy[i], ...row };
            return copy;
          }
          return [row, ...prev];
        });
      })
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(
    () =>
      runs.filter((r) => {
        const okStatus = status === "all" || displayStatus(r) === status;
        const okQuery = !q || r.run_id.includes(q);
        return okStatus && okQuery;
      }),
    [runs, q, status],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search run id…"
            className="w-64 rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={`chip capitalize ${
                status === f ? "bg-primary/20 text-primary" : "bg-ink/5 text-muted hover:text-fg"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <RunsTable runs={filtered} />
    </div>
  );
}
