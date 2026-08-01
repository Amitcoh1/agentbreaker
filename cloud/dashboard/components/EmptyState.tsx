import { ArrowRight } from "lucide-react";

// #76a — the shared first-run panel. Any zero-data dashboard surface renders this instead of a wall
// of zeros, so a new account has a path forward: the install snippet + a CTA into the 15-minute
// onboarding runbook (/docs/connect, shipped in #192). Set NEXT_PUBLIC_DOCS_URL to your docs domain
// once it exists (#22); until then it falls back to the repo quickstart, which is always valid.
const DOCS = process.env.NEXT_PUBLIC_DOCS_URL;
export const CONNECT_URL = DOCS
  ? `${DOCS}/docs/connect`
  : "https://github.com/Amitcoh1/agentbreaker#quickstart";

// Kept verbatim-consistent with /docs/connect step 2 so the two onboarding surfaces never drift.
const SNIPPET = `pip install breakerbox

from breakerbox import guard
app = guard(
    compiled,
    budget_usd=5.00,
    report_to="https://YOUR_PROJECT_REF.functions.supabase.co/ingest",
    shadow=True,   # observe only — nothing enforced yet
)`;

export function EmptyState({
  title = "Connect your first agent",
  hint = "Point a guarded agent here and its spend, trips, and receipts stream in live. Start in shadow mode — nothing is enforced until you say so.",
  snippet = true,
}: {
  title?: string;
  hint?: string;
  snippet?: boolean;
}) {
  return (
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
  );
}
