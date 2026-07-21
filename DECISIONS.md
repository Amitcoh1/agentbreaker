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
