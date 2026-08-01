import { Repeat, Sparkles, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { StatCard, StatGrid } from "@/components/StatCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// #26 — internal product signals (maintainer-only, not linked in the sidebar). Activation /
// retention / paid-shaped funnel for measuring the Phase-1 exit criteria. All aggregation happens in
// the security-definer product_signals() RPC (0007_product_signals.sql), which returns null unless
// the caller is in public.admins — so this page shows a restricted notice to everyone else. No PII,
// no per-user rows, no service-role key in the app.

type Signals = {
  activated_accounts: number;
  new_7d: number;
  new_30d: number;
  active_7d: number;
  returning: number;
  paid_shaped: number;
  by_week: { week: string; new_accounts: number }[];
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-lg font-semibold">Product signals</h1>
        <p className="text-sm text-muted">Activation, retention, and paid-shaped demand — aggregate, maintainer-only.</p>
      </header>
      {children}
    </div>
  );
}

export default async function SignalsPage() {
  const db = await createSupabaseServerClient();
  const { data } = await db.rpc("product_signals");
  const s = data as Signals | null;

  if (!s) {
    return (
      <Shell>
        <div className="card p-6 text-sm text-muted">
          This internal view is limited to maintainers.
        </div>
      </Shell>
    );
  }

  const weeks = s.by_week ?? [];
  const maxWeek = weeks.reduce((m, w) => Math.max(m, w.new_accounts), 0);
  const activationPct = s.activated_accounts > 0 ? (s.returning / s.activated_accounts) * 100 : 0;

  return (
    <Shell>
      <StatGrid>
        <StatCard label="Activated accounts" value={String(s.activated_accounts)} sub="ran ≥1 guarded workflow" icon={Users} />
        <StatCard label="New (30d)" value={String(s.new_30d)} sub={`${s.new_7d} in the last 7d`} icon={UserPlus} brass={s.new_7d > 0} />
        <StatCard
          label="Returning"
          value={String(s.returning)}
          sub={`${activationPct.toFixed(0)}% active in ≥2 weeks`}
          icon={Repeat}
        />
        <StatCard label="Paid-shaped" value={String(s.paid_shaped)} sub="≥$10 spent or a budget trip" icon={Sparkles} brass={s.paid_shaped > 0} />
      </StatGrid>

      <div className="card p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold">New accounts / week</div>
          <div className="text-xs text-muted">first guarded run, last 12 weeks · {s.active_7d} active in the last 7d</div>
        </div>
        {weeks.length === 0 ? (
          <div className="text-xs text-muted">No activations yet.</div>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => (
              <div key={w.week} className="flex items-center gap-3">
                <span className="num w-16 shrink-0 text-xs text-muted">{w.week.slice(5)}</span>
                <div className="h-1.5 flex-1 rounded bg-ink/5">
                  <div
                    className="h-1.5 rounded bg-ink/70"
                    style={{ width: `${maxWeek > 0 ? (w.new_accounts / maxWeek) * 100 : 0}%` }}
                  />
                </div>
                <span className="num w-8 shrink-0 text-right text-xs">{w.new_accounts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
