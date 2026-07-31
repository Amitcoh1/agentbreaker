# Breakerbox — capabilities

**What Breakerbox actually does, in one page.** Runtime spend enforcement for AI agents: trip,
degrade, and stop — not just alert. This catalog is generated from the source at **v0.11.0**, not
from marketing copy. Where a feature is partial or unfinished, it says so.

**Maturity legend:** ✅ shipped (real logic + tests) · 🟡 partial (works, with a named limit) · 🟧 stub/UI-only.

---

## The mental model

Everything below hangs off four ideas:

1. **One enforcement core** with **8 trip reasons** — `budget · hops · ttl · velocity · depth · loop · capability · remote`.
2. **Three front-ends** to attach that core — `guard()` (LangGraph), `BreakerboxMiddleware` (LangChain 1.x), and `claudecode` hooks (Claude Code itself).
3. **A static / CI half** that proves cost and scans for risk **without ever running your agent** (zero API calls).
4. **An optional cloud** that only *observes and generates code* — no proxy runs your flow, no provider key is ever stored or transmitted.

---

## 1. Runtime enforcement — `guard(...)`

One wrap on a compiled LangGraph app. Enforcement is in-process, deterministic, no LLM in the hot
path. Accounting is **reserve → execute → reconcile** (a credit-card hold), so parallel branches
can't race past the ceiling. All knobs below are ✅.

| Knob | What it does | Example |
|---|---|---|
| `budget_usd` | Hard dollar ceiling, held before each call | `budget_usd=5.00` |
| `sub_budgets` | Per-node escrow under the root; a child can't exceed its slice | `sub_budgets={"researcher": 2.0}` |
| `topup_policy` | How sub-budgets borrow: `deny` / `auto` / custom fn | `topup_policy="auto"` |
| `max_hops` | Total model + tool dispatch cap | `max_hops=40` |
| `max_depth` | Sub-agent nesting-depth cap | `max_depth=3` |
| `ttl_seconds` | Wall-clock cap (🟡 soft — enforced at the next hop boundary) | `ttl_seconds=900` |
| `velocity_usd_per_min` | Burn-rate rail, 60s rolling window (🟡 soft — next hop) | `velocity_usd_per_min=0.5` |
| `detect_loops` | Semantic repeat detection, **no LLM** (char-shingle Jaccard) | `detect_loops=True` |
| `capability_lock` | After untrusted input, block side-effecting tools **before** they fire | `capability_lock=True` |
| `on_trip` | `pause` (checkpoint + `resume()`) or `kill` (lists side-effects fired) | `on_trip="pause"` |
| `ladder` | Degradation rungs — model-swap / tool-narrow / graceful-stop / kill | `ladder=Ladder.default(cheap)` |
| `shadow` | Observe-only: logs `would_trip`, enforces nothing | `shadow=True` |
| `live` | Streams a `$spent / $budget` line to your terminal each hop | `live=True` |
| `alerts` | Threshold warnings (default 50 / 80 / 95%) via callback or stderr | `alerts=True` |
| `otel` | OpenTelemetry GenAI spans per run + hop | `otel=True` |
| `tags` | Cost-attribution metadata carried into the receipt | `tags={"team": "search"}` |
| `report_to` / `control_key` | Stream events to the optional cloud; enable remote pause/kill | `report_to=URL` |

```python
from breakerbox import guard

app = guard(
    compiled,
    budget_usd=5.00,
    sub_budgets={"researcher": 2.0},
    max_hops=40, max_depth=3, ttl_seconds=900,
    velocity_usd_per_min=0.5,
    detect_loops=True,
    capability_lock=True,
    on_trip="pause",
)
result = app.invoke(state)          # raises BudgetPaused / BudgetKilled at the boundary
# app.resume(checkpoint_id, extra_budget_usd=2.00)  # after a pause
```

### The 8 trip reasons

`BUDGET` · `HOPS` · `TTL` · `VELOCITY` · `DEPTH` · `LOOP` · `CAPABILITY` · `REMOTE` (dashboard/CLI
pause·kill). Every trip produces an explainable **`TripDecision`** (see §3).

### Self-metering (✅)

Counts input tokens locally (tiktoken), meters streamed output chunks, then reconciles against the
provider's reported usage and **flags discrepancies** — never trusts a single `usage` field, never
meters an unknown model as `$0` (configurable via `unknown_model`).

---

## 2. Front-ends — three ways to attach the core

| Front-end | For | Notes |
|---|---|---|
| **`guard()`** | LangGraph (0.3 callback) | ✅ Full enforcement — all 8 trip reasons. The ladder is *advisory* here (it can't rewrite a request from a callback). |
| **`BreakerboxMiddleware`** | LangChain 1.x agent middleware | 🟡 **Phase 1 = budget + max_hops only.** The **only** front-end that can *rewrite the request* — real model-swap / tool-narrow via `wrap_model_call`. velocity / ttl / loops / capability are deferred. |
| **`breakerbox claudecode init`** | Claude Code itself | ✅ Session + daily dollar ceilings enforced via three local hooks (UserPromptSubmit / PreToolUse / Stop). No server, no keys. |

---

## 3. Degradation & explainability

- **Degradation ladder** (✅ policy; enforcement is middleware-only). Rungs at fractional
  thresholds prescribe actions: `MODEL_SWAP`, `TOOL_NARROW`, `GRACEFUL_STOP`, `KILL`.
  `Ladder.default(swap_model)` = swap + narrow at 80%, graceful stop at 100%. **In `guard()` these
  are observed, not applied; only `BreakerboxMiddleware.wrap_model_call` actually enforces the swap/narrow.**
- **`TripDecision`** (✅) — the explainable trip object, stable/deterministic JSON: `reason`,
  `policy`, `threshold`, `counter_value` (% spent), `ladder_rung`, `action`, `confidence`
  (1.0 for hard limits, 0.9 for loop, 0.95 for velocity), `override_url`, `spent_micro`, `budget_micro`.
- **Shadow mode** (✅) — `shadow=True` records `would_trip` events and enforces nothing. Then
  `breakerbox shadow-report` aggregates: *"enforcement would have prevented $X across N runs."*
  The adoption on-ramp — prove value before you turn enforcement on.
- **The receipt** (✅ local) — terminal summary + single-file `report.html` (inline CSS/SVG, no JS)
  + JSON, built purely from the event log. Leads with the indisputable number — **stopped at $Y,
  budget $Z** — plus per-hop cost, trip reason, projected-uncapped vs spent (`saved_usd`), and the
  **blast radius**: side-effecting tools that already fired.
- **Live / alerts / OTel / tags** (✅) — real-time spend line, threshold warnings, OpenTelemetry
  spans, cost-attribution tags carried into the receipt.

---

## 4. Prove cost before you run (static, zero API calls)

| Command | What it gives you |
|---|---|
| `breakerbox ceiling spec.json --max 5` | ✅ Provable worst-case dollar ceiling from the spec (or prints `UNBOUNDED` — never invents a number). DAGs sum worst cases; capped loops = `hops × costliest call`. |
| `breakerbox lock --check` | ✅ Pin prices + ceilings to `breakerbox.lock`; fail CI on drift (like `package-lock.json`). |
| `breakerbox diff old.py new.py --fail-on-increase` | ✅ Budget delta between two commits' specs or generated files; gate a PR on a cost increase. |
| `breakerbox policy *.json -p breakerbox.yaml` | ✅ Policy-as-code: `max_ceiling_usd`, `max_node_cost_usd`, `max_hops`, `require_bounded`, `banned_models`, `allow_destructive`. |
| `breakerbox egress spec.json` | ✅ Static network-egress certificate — which API hosts the spec can reach; flags unknown providers (air-gap check). |

---

## 5. Security suite (new in 0.11.0)

All ✅, all emit the **same finding format**, all composable into CI via `baseline`.

| Command | Finds |
|---|---|
| `breakerbox dow` | **Denial-of-wallet** — names the uncapped loop as the attack surface, prices the worst case. |
| `breakerbox flow` | **Langflow exports** — embedded credentials (CVE-2026-55255 class) + untrusted→action paths with no approval gate. |
| `breakerbox mcp` | **MCP config posture** — hardcoded secrets, unpinned `npx @latest` supply chain, non-TLS remotes, static tokens in headers. |
| `breakerbox baseline` | **Regression gate** — accept today's findings once (stable fingerprints); CI then fails only on *new* ones. |

Plus the runtime primitive: **`capability_lock=True` + `mark_untrusted(tool)`** (✅) — once untrusted
content enters the run, side-effecting tools are blocked **before they execute**, not flagged after.

---

## 6. Build & scaffold

| Command | What it does |
|---|---|
| `breakerbox init -t research-agent -o ./agent` | ✅ Scaffold a guarded starter (`research-agent`, `support-triage`, `batch-extract`). |
| `breakerbox validate spec.json` | ✅ Structural + semantic spec validation (budget hierarchy, reachability, cycles). |
| `breakerbox build spec.json -o agent.py` | ✅ Codegen: spec → readable, hand-editable guarded Python. Embeds the ceiling proof in the header. Enforces `breakerbox.yaml` policy at build time. |
| `breakerbox update-prices` | ✅ Refresh the bundled price table from LiteLLM (~2000 models). |

**Byte-parity** (✅): the visual builder's TypeScript codegen (`graphspec.ts`) emits Python
**byte-identical** to the CLI's `codegen.py`, locked by golden fixtures run in **both** pytest and
vitest. The GraphSpec JSON (`config` + `nodes` + `edges`) is the stable interchange format.

---

## 7. Optional cloud (`cloud/dashboard` + Supabase)

No proxy executes your flow; codegen and observation only.

| Feature | Status |
|---|---|
| Runs list + live run timeline (per-hop tokens/cost, cumulative chart) | ✅ real data, RLS-scoped to `owner_id` |
| DecisionCard (surfaces `TripDecision`) + shadow badge | ✅ |
| Remote pause / kill | ✅ per-run control keys — no global master key |
| Visual **builder** (React Flow → guarded Python) | ✅ codegen only; nothing executes server-side, keys never leave the browser |
| Cost forecast on the canvas (p50–p95 band, what-if loop slider) | ✅ advisory, in-browser, no API calls |
| Auth (Supabase: Google / GitHub OAuth + magic link) | ✅ |
| Ingest + control edge functions, Postgres RLS (`owner_id = auth.uid()`) | ✅ |
| Shareable receipt links (`/r/<run_id>`) | 🟡 JSON live; on-demand HTML rendering not yet wired |
| Dashboard dry-run simulator | 🟧 UI present, engine not wired |

---

## 8. Full CLI (15 commands)

```
# cost & CI
breakerbox ceiling <spec>        provable worst-case dollar ceiling (or UNBOUNDED)
breakerbox lock [--check]        pin prices + ceilings; fail on drift
breakerbox diff <old> <new>      cost delta between specs/files (--fail-on-increase)
breakerbox policy <spec>         check specs against breakerbox.yaml
breakerbox egress <spec>         static network-egress certificate

# security
breakerbox dow <spec>            denial-of-wallet (uncapped-loop) risk
breakerbox flow <flow.json>      Langflow export: embedded creds + unguarded actions
breakerbox mcp <config.json>     MCP server posture (secrets, supply chain, TLS)
breakerbox baseline              accept findings once; CI fails on new ones

# build & spec
breakerbox init [-t template]    scaffold a guarded starter
breakerbox validate <spec>       structural + semantic spec check
breakerbox build <spec>          spec → readable guarded Python

# ops
breakerbox shadow-report         aggregate would-trip events ("$ prevented")
breakerbox claudecode init       install session/daily ceilings into Claude Code
breakerbox update-prices         refresh the bundled price table (LiteLLM)
```

---

## 9. Honest gaps (don't over-claim these)

- **`BreakerboxMiddleware` is Phase 1** — budget + hops only; velocity / ttl / loops / capability are guard()-only for now.
- **Ladder model-swap / tool-narrow only *enforce* in the middleware** — in `guard()` they're advisory (observed, not applied).
- **`ttl_seconds` and `velocity_usd_per_min` are "soft"** — enforced at the next hop boundary, not mid-stream. A single long call can overshoot by one hop.
- **`alerts` has no native Slack/email channel** — it's a callback; you wire the destination.
- **Cloud shareable-receipt HTML** is partial (JSON works); the **dashboard dry-run simulator is a stub** (UI only).
- **No per-model spend cap** — only the global budget (a single call may use the whole budget if it fits the reserve).

---

## 10. Who uses what

- **App dev, "just don't let it run away"** → `guard(budget_usd=..., detect_loops=True, on_trip="pause")` + read the receipt.
- **Platform / FinOps** → `sub_budgets` + `tags` + `otel` + the cloud dashboard for per-team attribution; `shadow=True` first to size the impact.
- **Security** → `capability_lock=True` + `breakerbox dow/flow/mcp` + `baseline` in CI.
- **CI owner** → `breakerbox ceiling --max`, `lock --check`, `diff --fail-on-increase`, `policy`.
- **Claude Code user** → `breakerbox claudecode init --session-ceiling 5 --daily-ceiling 50`.
- **Visual-first** → the builder canvas → **Generate** → the same guarded Python.
