# AgentBreaker

**A circuit breaker + hierarchical dollar budget for LangGraph agents. In-process. No proxy.**

> Your gateway caps your org's spend. AgentBreaker governs a single workflow from the
> inside: hierarchical budgets across sub-agents, a safe pause instead of a mid-flight 429,
> and a receipt showing exactly where the money went.

Wrap a compiled LangGraph app in one call. Every model and tool dispatch inside the graph —
including sub-agents and subgraphs — inherits one real-dollar budget. When a limit trips,
the workflow stops **at the next hop boundary** (never mid-call) and drops a shareable HTML
receipt of the run.

```python
from agentbreaker import guard

app = guard(
    my_langgraph_app,
    budget_usd=5.00,           # hard ceiling for the whole workflow DAG
    max_hops=50,               # total model/tool steps across all branches
    ttl_seconds=600,           # wall-clock limit
    velocity_usd_per_min=2.0,  # trip if the burn rate spikes
    on_trip="pause",           # "pause" | "kill"
)

result = app.invoke(inputs)    # same call you already make
```

That's it. No proxy, no Docker, no gateway to run. Enforcement lives *inside* the process
that makes the calls, so there's no direct-call bypass.

## The demo

A broken retry loop that never drops its context, so each hop costs more than the last
([`examples/runaway_demo`](examples/runaway_demo)) — no API keys required:

```
==============================================================
  UNGUARDED runaway : ran 60 hops, spent $12.63
  GUARDED           : killed early, spent $0.82  (budget $0.90)
  AVERTED           : $11.81
==============================================================
```

It stops **strictly under budget** — because the model declares a real `max_tokens`, the
reserve estimate is a true upper bound, so the call that would cross the line is blocked
before it runs. Every run also writes a self-contained `report.html`:

```
────────────────────────────────────────────────────────
 AgentBreaker receipt · killed (budget)
 stopped at $0.8157   budget $0.9000   hops 13
 projected (naive linear extrapolation, likely an underestimate): $3.13
────────────────────────────────────────────────────────
```

(See [`sample_receipt.html`](examples/runaway_demo/sample_receipt.html) for the full HTML.)

## What it actually does

- **Hierarchical budget escrow.** Not a flat session counter. A parent sub-allocates budget
  to child agents; a child can never spend beyond its allocation; a parent's remaining is
  `budget − Σ(child allocations) − own spend`. Accounting is reserve → execute → reconcile
  (a credit-card hold), so parallel branches can't race past the ceiling. Concurrency-safe
  and property-tested (`Σ spent + Σ reserved ≤ root budget`, always).
- **Graceful trip actions.**
  - `pause` — checkpoints via LangGraph's native checkpointer and raises `BudgetPaused`;
    `app.resume(checkpoint_id, extra_budget_usd=...)` continues from where it stopped.
  - `kill` — stops, finalizes the receipt, raises `BudgetKilled` listing which
    **side-effecting** tools already fired (so you can compensate).
- **Self-metering.** Counts input tokens locally (tiktoken) and meters streamed output
  chunks, then reconciles against the provider's reported usage and flags discrepancies —
  never trusts a single `usage` field, never meters an unknown model as `$0`. If a call ran
  without `max_tokens` and the cap landed one hop late, the receipt flags that hop explicitly.
- **The receipt.** Terminal summary + single-file `report.html` (inline CSS/SVG, no JS, no
  external assets) + JSON. Leads with the indisputable number — **stopped at $Y, budget $Z** —
  with the projection as clearly-labelled fine print.

## How it composes with your gateway

Gateways (LiteLLM, Portkey, Cloudflare, Kong) and AgentBreaker solve different layers.
Run both: the gateway caps the org, AgentBreaker governs the workflow's internal structure.

| | Gateways / LiteLLM | AgentBreaker |
|---|:---:|:---:|
| Per-key / per-team dollar budget | ✅ | — *(use your gateway)* |
| Flat per-session budget + max iterations | ✅ | ✅ |
| In-process, zero infra (no proxy, no Docker) | — | ✅ |
| Hierarchical parent→child escrow across sub-agents | — | ✅ |
| Graceful pause/resume at a hop boundary (not a mid-flight 429) | — | ✅ |
| Side-effect-aware, shareable run receipt | — | ✅ |

*Not a competitor to your gateway — a complement.*

## Install

```bash
pip install agentbreaker
```

Python 3.11+. Core deps: `langgraph`, `langchain-core`, `tiktoken`, `jinja2`.

## Notes & limitations (read before you rely on it)

- **`on_trip="pause"` needs a checkpointer.** Compile your graph with one
  (`.compile(checkpointer=MemorySaver())`); `guard()` raises if it's missing.
- **The overshoot rule:** the guard never interrupts a call mid-flight. If your model has
  **no** `max_tokens`, the reserve estimate can under-count and the cap is enforced one hop
  late (overshoot bounded by a single call) — the receipt flags that hop. Set `max_tokens`
  and it stops strictly under budget.
- **Prices** (`prices.json`, ~2000 models) are sourced from LiteLLM's community-maintained
  price table. Refresh them any time with `agentbreaker update-prices` (bundled table is the
  offline fallback). Still spot-check the models you care about. Override per-model or set
  `unknown_model="default_rate"` to meter unknown models at a conservative rate instead of
  failing.

## Cloud dashboard (optional)

Everything above works with zero cloud. If you want a shared, **live** view of runs, point
the guard at a Supabase-backed dashboard:

```python
app = guard(my_app, budget_usd=5.00, report_to="https://YOUR_REF.functions.supabase.co/ingest")
```

Events stream to the dashboard as the run executes (best-effort and non-blocking — a cloud
outage never affects the run); each run gets a shareable, unlisted URL with a live timeline.
Deploy runbook and code in [`cloud/`](cloud) (Supabase + Next.js on Vercel).

## Develop

```bash
pip install -e ".[dev]"
pytest -q          # pricing, ledger (+ hypothesis), tripwire, meter, guard, report, sink
ruff check .
```

## License

MIT
