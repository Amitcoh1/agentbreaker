import { ArrowRight } from "lucide-react";

// #76a / #200 — the shared first-run panel. Any zero-data dashboard surface renders this instead of a
// wall of zeros, so a new account has a path forward. It leads with the observe-mode on-ramp (the
// #197 auto-baseline entry point) + a CTA into the 15-minute onboarding runbook (/docs/connect,
// shipped in #192). Set NEXT_PUBLIC_DOCS_URL to your docs domain once it exists (#22); until then it
// falls back to the repo quickstart, which is always valid.
const DOCS = process.env.NEXT_PUBLIC_DOCS_URL;
export const CONNECT_URL = DOCS
  ? `${DOCS}/docs/connect`
  : "https://github.com/Amitcoh1/agentbreaker#quickstart";

// The observe on-ramp: guard(app) with no budget enforces nothing — it just records real cost so
// `breakerbox observe-report` can suggest a cap you trust. report_to streams the same events here so
// the example profile below fills with your own numbers. /docs/connect step 2 wires the identical
// report_to, then layers shadow → enforcement on top.
const SNIPPET = `pip install breakerbox

from breakerbox import guard

# observe mode: no budget, nothing enforced — it just records real cost.
app = guard(compiled, report_to="https://YOUR_PROJECT_REF.functions.supabase.co/ingest")`;

// Mirrors `breakerbox observe-report` (src/breakerbox/observe.py): the cost profile + a suggested
// starting budget = p95 rounded up to the cent. These are an illustrative EXAMPLE, not this account's
// data — a new account has none; wrapping with guard(app) fills it with your own. Numbers match the
// marketing hero's observe demo (median $0.18 · p95 $2.40 · one $12.63 runaway).
const OBS_STATS: [string, string][] = [
  ["MEDIAN", "$0.18"],
  ["P95", "$2.40"],
  ["P99", "$6.10"],
  ["MAX", "$12.63"],
];

function ObserveProfile() {
  return (
    <div className="card p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">What observe mode learns</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            A few runs in,{" "}
            <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">breakerbox observe-report</code>{" "}
            turns your real costs into a cap you can accept — the median, the p95, and the tail that
            hides your runaways.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] font-medium tracking-wide text-muted">
          EXAMPLE
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {OBS_STATS.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <dt className="text-[10px] font-medium tracking-wide text-muted">{label}</dt>
            <dd className="num mt-1.5 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg border border-border bg-ink/5 p-4">
        <code className="block break-all text-xs text-ink">
          guard(app, budget_usd=2.40, on_trip=&quot;pause&quot;)
        </code>
        <p className="mt-2 text-xs text-muted">
          A <span className="text-ink">$2.40</span> cap (p95, rounded up) would have prevented{" "}
          <span className="text-ink">$74</span> across 214 runs — mostly one runaway.
        </p>
      </div>
    </div>
  );
}

export function EmptyState({
  title = "Connect your first agent",
  hint = "Wrap your app in guard(app) and its runs stream in here. Start in observe mode — no budget, nothing enforced — and it learns what you actually spend before you set a cap.",
  snippet = true,
  observe = false,
}: {
  title?: string;
  hint?: string;
  snippet?: boolean;
  observe?: boolean;
}) {
  return (
    <>
      <div className="card p-6 lg:p-8">
        <div className="max-w-xl space-y-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{hint}</p>
          </div>
          {snippet && (
            <pre className="overflow-x-auto rounded-lg bg-ink/5 p-3 text-xs leading-relaxed">
              <code>{SNIPPET}</code>
            </pre>
          )}
          <a
            href={CONNECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-brass px-3.5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Connect your agent — 15 min <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
      {observe && <ObserveProfile />}
    </>
  );
}
