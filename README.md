# AgentBreaker

**The visual agent builder that can't be hacked into — because there's nothing to hack.**

> No server execution. No stored keys. Your graph becomes readable Python that runs on your
> machine, wrapped in a hard dollar budget.

Prototype anywhere; ship with AgentBreaker. You draw a workflow on a canvas, and it generates
plain, editable LangGraph **Python** you download and run yourself — wrapped in `guard()`, a
hierarchical dollar budget that stops runaway loops at a hop boundary and writes a receipt of
exactly where the money went. Three things make it different:

1. **Zero attack surface — codegen only.** No endpoint ever executes your flows; no provider
   key is ever stored or transmitted. There's nothing on our side to compromise. (See
   [Why no Run button?](#why-no-run-button))
2. **Budget-first.** The only builder where hierarchical budget escrow, trip rules, and
   side-effect tagging are part of the canvas itself.
3. **Code you own.** The output is readable, hand-editable Python — scaffolding, not a walled
   garden.

## The budget (the library at the core)

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

result = app.invoke(inputs)    # the same call you already make
```

Every model and tool dispatch inside the graph — including sub-agents and subgraphs —
inherits one real-dollar budget. When a limit trips, the workflow stops **at the next hop
boundary** (never mid-call) and drops a shareable HTML receipt. No proxy, no Docker, no
gateway to run: enforcement lives *inside* your process, so there's no direct-call bypass.

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

## Build it visually

[`cloud/dashboard/app/builder`](cloud/dashboard/app/builder) is a drag-and-drop canvas
(model / tool / router / start / end nodes) with a live **Budget Tree** — root budget →
per-node allocations → unallocated remainder. Over-allocate and it turns red and **blocks
export**. Hit **Generate** and you get the guarded Python above, ready to copy or download.
Everything runs in your browser; the spec → Python codegen is shared with the `agentbreaker
build spec.json` CLI and locked to it by golden-fixture tests (Python and TS, enforced in CI).

```bash
cd cloud/dashboard && npm install && npm run dev   # http://localhost:3000/builder
```

## Why no Run button?

Server-side flow builders that run your graphs and hold your provider keys have been a
repeated remote-code-execution target. In Langflow (the category leader, ~100k+ GitHub
stars, IBM/DataStax-backed) the pattern is well documented and public:

- **CVE-2025-3248** (CVSS 9.8) — unauthenticated RCE via a code-validation endpoint that
  passed user input to `exec()`; on CISA's KEV list, used to deploy the Flodrix botnet.
- **CVE-2025-34291** (CVSS 9.4) — an account-takeover chain that also **exfiltrates the API
  keys stored in a workspace**; on CISA KEV, used by the MuddyWater APT for initial access.
- **CVE-2026-33017** (CVSS 9.8) — unauthenticated RCE via the public flow-build endpoint;
  on CISA KEV, weaponized within ~20 hours of disclosure to drop cryptominers.
- **CVE-2026-5027** (CVSS 8.8) — path-traversal RCE via file upload, with ~7,000 exposed
  instances observed under active exploitation.

This isn't a knock on Langflow's product — it's an architectural fact: **a server that runs
your flows and holds your keys is a high-value target.** AgentBreaker removes the target. The
canvas only ever produces a Python *string* you run yourself, and your API keys live in your
own environment — never in a dashboard, database, or edge function. There's no endpoint to
exploit because no endpoint executes anything. That's the trade: you give up one-click cloud
runs, and in exchange there is nothing to breach. **Prototype in a tool like Langflow if you
like; ship the production-safe version here.**

## How it compares (facts only)

| | Langflow | LiteLLM budgets | AgentBreaker |
|---|:---:|:---:|:---:|
| Visual graph building | ✅ rich | — | ✅ budget-first |
| Server executes your flows | ✅ *(attack surface)* | n/a | ❌ by design |
| Stores your provider keys | ✅ | ✅ *(proxy)* | ❌ never |
| Hierarchical per-agent dollar escrow | — | — *(flat session)* | ✅ |
| Graceful pause/resume at a hop boundary | — | — *(hard error)* | ✅ |
| Output is plain, editable Python | partial *(export)* | n/a | ✅ core promise |

LiteLLM/Portkey/Kong-style gateways solve a different layer (org-wide per-key spend) and
compose fine alongside this — the gateway caps the org, AgentBreaker governs one workflow's
internal structure. Every claim above maps to a public, verifiable fact.

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
