import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "blue" | "amber" | "green" | "red";

const iconTone: Record<Tone, string> = {
  blue: "bg-primary/15 text-primary",
  amber: "bg-accent/15 text-accent",
  green: "bg-good/15 text-good",
  red: "bg-bad/15 text-bad",
};
const subTone: Record<Tone, string> = {
  blue: "text-primary",
  amber: "text-accent",
  green: "text-good",
  red: "text-bad",
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="card p-4 transition-shadow hover:shadow-glow">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconTone[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="num mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className={`mt-1 text-xs ${subTone[tone]}`}>{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}
