import Link from "next/link";
import { displayStatus, type Run } from "@/lib/supabase";
import { shortId, timeAgo, usd } from "@/lib/format";

const badge: Record<string, string> = {
  completed: "bg-good/15 text-good",
  killed: "bg-bad/15 text-bad",
  paused: "bg-accent/15 text-accent",
  running: "bg-primary/15 text-primary",
};

export function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  return (
    <span className={`chip ${badge[status] ?? "bg-ink/10 text-muted"}`}>
      {status === "running" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      )}
      {status}
      {reason ? ` · ${reason}` : ""}
    </span>
  );
}

export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        No runs yet. Point a guard here with <code className="text-fg">report_to=</code>.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left font-medium">Run</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Hops</th>
            <th className="px-4 py-3 text-right font-medium">Spent</th>
            <th className="px-4 py-3 text-right font-medium">Projected</th>
            <th className="px-4 py-3 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.run_id}
              className="border-b border-border/60 last:border-0 hover:bg-ink/[0.03]"
            >
              <td className="px-4 py-3">
                <Link href={`/runs/${r.run_id}`} className="num text-primary hover:underline">
                  {shortId(r.run_id)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={displayStatus(r)} reason={r.trip_reason} />
              </td>
              <td className="num px-4 py-3 text-right">{r.hops ?? "—"}</td>
              <td className="num px-4 py-3 text-right">{usd(r.spent_usd)}</td>
              <td className="num px-4 py-3 text-right text-muted">{usd(r.projected_uncapped_usd)}</td>
              <td className="px-4 py-3 text-right text-muted">{timeAgo(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
