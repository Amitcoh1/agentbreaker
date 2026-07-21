# Decisions

Per spec §9.1: record decisions made where the spec was ambiguous or silent.

## Phase 0

- **Package lives at repo root**, not a nested `agentbreaker/agentbreaker/`.
  The working dir is already `agent-breaker/`, so the layout is `src/agentbreaker/`
  directly under it (spec §9.2's outer `agentbreaker/` is the repo dir itself).
- **Deps added per phase, not all upfront.** §5 lists langgraph/tiktoken/jinja2/pydantic
  as the *ceiling* of allowed runtime deps. Phase 0 (pricing only) needs none, so
  `dependencies = []`. Later phases add what they import.
- **Budget unit = microdollars** (int), 1 USD = 1e6 microUSD. `cost_microusd()` is the
  canonical calculator; the ledger consumes ints. Spec §9.2 names `cost_usd()` in the
  file list but §9.3/Phase-0 checklist both specify microdollars — microdollars win.
  Formula: `microUSD = tokens_in*in_rate + tokens_out*out_rate` (the /1e6 and *1e6 cancel).
- **No pydantic for pricing.** stdlib `json` + a frozen dataclass covers the price table.
  pydantic (if used at all) waits for the config/event schema phases.
- **Lint = ruff** (check + isort + pyupgrade + bugbear), one tool.
- **prices.json values need launch verification.** Populated from known early-2026 pricing
  for ~15 top models; spec §8 requires re-verifying against provider pages the week of
  launch. `default_rate` set to a deliberately conservative 5/15 so unknown-but-metered
  models are never under-counted.

## Phase 1

- **`threading.Lock`, not `asyncio.Lock`.** §9.3's `Ledger` methods are sync
  (`def reserve`, not `async def`). A `threading.Lock` protects both thread-pool executors
  and asyncio tasks (critical sections take no `await`, so they're atomic under a single
  event loop anyway); an `asyncio.Lock` would force async signatures that contradict §9.3.
  Spec §5 says "asyncio locks" — overridden here for correctness against the API contract.
- **One global lock** (ponytail): reserve/reconcile/open are tiny non-blocking sections.
  Per-account locks only if profiling shows contention.
- **`reconcile(actual)` records truth even if `actual > estimate`.** Under-counting spend
  is the exact LiteLLM-class bug we exist to prevent, so we never clamp spend down. The
  guard's job (Phase 2) is to reserve a real upper bound (`input + max_tokens*out_rate`);
  if it does, `actual <= estimate` always and the invariant is airtight.
- **Escrow invariant proven, then property-tested.** A node's local `remaining >= 0`
  telescopes to the global `Σspent + Σreserved <= root_allocation` because child
  allocations cancel against their parent's `child_alloc` term. Hypothesis checks it holds
  after every op; a threaded test checks siblings racing can't overspend.
- **Top-up bubbles up a linear ancestor chain.** Max grant = Σ(remaining) of strict
  ancestors; `_grant` funds a node from its parent, recursively topping the parent from the
  grandparent when short. Root can't be topped up (no funder). Policies: `deny` | `auto` |
  `callable(node_id, requested, available) -> granted` (clamped to available).

## Phase 2

- **Interception = one LangChain callback handler injected into the run config.** It
  propagates down the whole run tree (nodes, tools, sub-agents, subgraphs) via
  langchain-core's contextvars, so a node's `model.invoke()` inherits it with no manual
  wiring — this *is* the "context propagation works with subgraphs" deliverable, for free.
- **Enforcement is at the hop boundary.** The gate runs at the START of each model/tool
  call (`on_chat_model_start` / `on_tool_start`); an in-flight call is never interrupted. A
  velocity/budget limit crossed at reconcile is marked tripped and enforced at the NEXT gate
  (matches flow 4.2). TTL/hops are enforced directly at the gate.
- **`raise_error = True` on the handler** so the gate's internal `_Trip` propagates out of
  the model call instead of being swallowed. Side effect: LangChain logs `Error in ...
  callback: _Trip(...)` before re-raising — cosmetic, the trip works. Left as-is.
- **guard auto-wiring = root + explicit `sub_budgets`.** The ledger supports arbitrary
  hierarchy (Phase 1), but wiring a full per-node account tree from the run graph is
  deferred; a call bills its node's sub-budget account if named, else the root pool. Named
  accounts can still `request_topup` under the configured policy.
- **`degrade` falls back to a graceful pause** (warned at construction). Transparent
  model-swap isn't reachable from a callback when `guard()` only holds the *compiled* app —
  the node already owns its model instance. A future `budget_model()` wrapper (opt-in at
  graph-build time) can do real swaps; until then degrade pauses instead of overspending.
- **Added `BudgetKilled`** (spec defined only `BudgetPaused`). `kill` is terminal and not
  resumable, so it needs its own exception; it carries `side_effects_fired`.
- **`side_effecting` via tool tags/metadata** (`tags=["side_effecting"]` or
  `metadata={"side_effecting": True}`), plus a `mark_side_effecting(tool)` helper — because
  the frozen `guard()` signature (§9.3) has no parameter for it.
- **Reserve = upper bound.** estimate uses the call's `max_tokens` or
  `DEFAULT_MAX_OUTPUT_TOKENS=1024`; reconcile bills the provider-reported usage (local count
  is the cross-check, and the streaming fallback when usage is absent).
- **tiktoken `o200k_base` approximates non-OpenAI tokenizers** — good enough for estimates;
  reconcile corrects to real usage anyway.

## Phase 3

- **Receipt is built only from the JSONL event stream** (spec 9.4). To carry
  budget/max_hops into the report without a second data source, a `start` event is emitted
  at run begin holding the run config — so the "single source" rule stays true.
- **Projection = mean cost/hop × max_hops**, clamped to ≥ spent, labelled as a conservative
  lower bound on a true runaway. Deliberately not a scary fabricated number — an inflated
  "projected $40" would get called out on HN; the honest floor still makes the point.
- **Status inferred from events:** a `pause` event → paused; a `trip` with no pause →
  killed; a `finish` with no trip → completed.
- **HTML is one self-contained file** — inline CSS + a single inline SVG sparkline, no JS,
  no external assets — so it renders offline and screenshots cleanly into Slack (F4).
- **Terminal summary prints on every finalize** (F4 lists it as an output). A library
  printing to stdout is mildly intrusive but it's the product's headline moment; the HTML
  path is also returned on `GuardedApp.last_report_path` and the trip exceptions.

## Phase 4

- **Demo uses real accumulating context + a real `max_tokens`**, not faked
  `usage_metadata`. First cut faked inflated usage, which decoupled the reserve estimate
  (real short-text tokens) from billed tokens (inflated) — the guard then stopped a hop late
  at $1.10 on a $0.90 budget, which reads as a leaky budget. With a real ceiling the reserve
  is a true upper bound, so the crossing call is blocked before it runs and the guard stops
  strictly under budget ($0.82 < $0.90). Honest and tight beats a bigger scary number.
- **`sample_receipt.html` is committed** as a viewable artifact; `reports/` is gitignored.
- **PyPI publish + Show HN/Reddit are user-run** (see `LAUNCH.md`). The wheel was built and
  verified locally (bundles `prices.json` + `template.html.j2`); it was not published.
- **Prices remain unverified for launch** — `LAUNCH.md` makes re-verifying them the first
  pre-flight item, since it's the most likely thing to get fact-checked on HN.
