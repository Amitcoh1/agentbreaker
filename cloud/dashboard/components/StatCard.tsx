import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Neutral by default; `brass` is earned — use it only when the number itself is a trip
// signal (e.g. active/killed runs worth attention), per the brand's one rule.
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  brass = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  brass?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            brass ? "bg-brass/15 text-brass" : "bg-ink/[0.06] text-ink"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="num mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className={`mt-1 text-xs ${brass ? "text-brass" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}
