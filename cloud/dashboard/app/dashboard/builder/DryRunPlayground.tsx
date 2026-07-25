"use client";

import { useMemo, useState } from "react";
import { Loader2, Play, X } from "lucide-react";
import type { GraphSpec, SpecNode } from "@/lib/graphspec";
import { simulate, simulateLive, routerOptions, type DryResult, type ModelResolve, type StopReason } from "@/lib/dryrun";
import { costUsd, usd } from "@/lib/pricing";
import { callModel, loadAiSettings, providerNote } from "@/lib/aiSuggest";

// Codegen-safe "Playground": a walk of the graph. Mock mode simulates (no calls, no keys). Live mode
// makes a real BYO-key call per model hop for real token usage + cost — still no server execution,
// tools still stubbed (their Python isn't run). Answers Langflow's Playground without a backend.
const STOP: Record<StopReason, string> = {
  end: "reached the end",
  budget: "stopped — would exceed budget",
  max_hops: "stopped — hit max_hops",
  "no-start": "no start node",
  "dead-end": "dead end — a node has no outgoing edge",
};

// A live model hop: call the user's configured model, price the real tokens at the NODE's model (what
// production will use). Bounded max_tokens so a dry run can't run up a big bill.
async function liveModelCall(node: SpecNode): Promise<ModelResolve> {
  const settings = loadAiSettings();
  const cap = Math.min(node.max_tokens ?? 512, 1024);
  const { tokensIn, tokensOut } = await callModel(
    settings,
    `You are the "${node.id}" step of a LangGraph workflow. Produce a brief, realistic output for this step (a sentence or two).`,
    cap,
  );
  const cost = costUsd(node.model, tokensIn, tokensOut);
  return {
    usd: cost ?? 0,
    model: node.model,
    note: `${tokensIn}+${tokensOut} tok${cost == null ? " · unpriced" : ""}`,
  };
}

export default function DryRunPlayground({ spec, onClose }: { spec: GraphSpec; onClose: () => void }) {
  const [routeChoices, setRouteChoices] = useState<Record<string, string>>({});
  const [live, setLive] = useState(false);
  const [liveResult, setLiveResult] = useState<DryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mock = useMemo(() => simulate(spec, { routeChoices }), [spec, routeChoices]);
  const result = live ? liveResult : mock;
  const routers = (spec.nodes ?? []).filter((n) => n.type === "router");
  const budget = spec.config?.budget_usd ?? 0;
  const over = result?.stop === "budget";

  const settings = loadAiSettings();
  const hasKey = !!settings.apiKey;
  const corsNote = providerNote(settings.provider, settings.baseUrl);

  const runLive = async () => {
    setRunning(true);
    setError(null);
    setLiveResult(null);
    try {
      setLiveResult(await simulateLive(spec, { routeChoices }, liveModelCall));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const tab = (on: boolean) =>
    `rounded px-2 py-0.5 text-xs ${on ? "bg-brass text-paper" : "text-muted hover:text-fg"}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              Dry run
              <span className="flex items-center gap-1 rounded bg-ink/5 p-0.5">
                <button className={tab(!live)} onClick={() => setLive(false)}>
                  mock
                </button>
                <button className={tab(live)} onClick={() => setLive(true)}>
                  live
                </button>
              </span>
            </div>
            <div className="text-[11px] leading-snug text-muted">
              {live
                ? "Real calls to your configured model, priced per node. Your key stays in this browser; tools are still stubbed."
                : "A simulated path — no model calls, no keys. Tools are stubbed (their code isn't run). An estimate, not a real run."}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-4">
          {routers.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted">Pick each router&apos;s branch to explore a path:</div>
              {routers.map((r) => {
                const opts = routerOptions(spec, r.id);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="whitespace-nowrap text-muted">{r.id} →</span>
                    <select
                      className="rounded border border-border bg-surface px-2 py-1 text-xs"
                      value={routeChoices[r.id] ?? opts[0]?.target ?? ""}
                      onChange={(e) => setRouteChoices((c) => ({ ...c, [r.id]: e.target.value }))}
                    >
                      {opts.map((o) => (
                        <option key={o.target} value={o.target}>
                          {o.label ? `${o.label} → ${o.target}` : o.target}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          {live && (
            <div className="space-y-2">
              {!hasKey && (
                <div className="rounded border border-border px-3 py-2 text-xs text-muted">
                  No API key set. Add one in the AI settings (used by &quot;Suggest code&quot;) — it stays
                  in this browser and is sent only to the provider.
                </div>
              )}
              {corsNote && <div className="text-[11px]" style={{ color: "#b8860b" }}>{corsNote}</div>}
              <button
                onClick={runLive}
                disabled={running || !hasKey}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  running || !hasKey ? "cursor-not-allowed bg-ink/5 text-muted" : "bg-brass text-paper hover:bg-brassdark"
                }`}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? "Running…" : liveResult ? "Run again" : "Run live"}
              </button>
              {error && <div className="text-xs" style={{ color: "#b8860b" }}>{error}</div>}
            </div>
          )}

          {result ? (
            <ol className="space-y-1">
              {result.trace.map((h, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{i + 1}</span>
                    <span className="font-medium">{h.nodeId}</span>
                    <span className="text-muted">{h.type}</span>
                    {h.routeLabel && <span className="text-muted">→ {h.routeLabel}</span>}
                    {h.sideEffecting && <span style={{ color: "#b8860b" }}>side-effecting</span>}
                    {h.note && <span className="italic text-muted">{h.note}</span>}
                  </span>
                  <span className="num">{h.usd > 0 ? usd(h.usd) : "—"}</span>
                </li>
              ))}
              {result.trace.length === 0 && <li className="text-xs text-muted">No hops taken.</li>}
            </ol>
          ) : (
            <div className="text-xs text-muted">Run live to trace the graph with real model calls.</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted" style={over ? { color: "#b8860b" } : undefined}>
            {result ? `${STOP[result.stop]} · ${result.hops} hop${result.hops === 1 ? "" : "s"}` : "not run yet"}
          </span>
          <span className="num font-semibold" style={over ? { color: "#b8860b" } : undefined}>
            {usd(result?.totalUsd ?? 0)}
            {budget > 0 && <span className="text-muted"> / {usd(budget)}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
