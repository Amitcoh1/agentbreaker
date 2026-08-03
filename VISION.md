# BREAKERBOX — Product Vision & Master Roadmap

> **This document is the source of truth for product direction.**
> Claude Code: treat this file as authoritative context when generating plans, epics,
> tasks, specs, or architecture decisions for Breakerbox. When a request conflicts
> with the principles in §3, flag the conflict instead of silently complying.
> When breaking down roadmap items (§7) into tasks, preserve the phase gates —
> do not pull Phase 2 work into Phase 0/1 without an explicit decision.

---

## 1. Vision statement

**Every production agent deployment will run behind a spend breaker, the same way every production service runs behind a rate limiter — and Breakerbox will be that layer.**

AI agent spend is structurally unpredictable. Stanford's Digital Economy Lab ([*How Do AI Agents Spend Your Money?*](https://arxiv.org/abs/2604.22750), Brynjolfsson et al.) showed agentic tasks consume ~1000x the tokens of chat, identical tasks vary up to 30x in cost between runs, accuracy saturates at intermediate spend (everything past the peak is waste), and models systematically underestimate their own usage. You cannot forecast a stochastic process with a fat tail. You can only bound it.

Breakerbox is the bound: **runtime enforcement of spend policies for AI agents — trip, degrade, and stop, not just alert — with a control plane where budgets are declared in plain language and reconciled against billing truth.**

Tagline: **Measure everywhere. Enforce at the boundary.**

## 2. The problem, in one incident

A team ran a four-agent LangChain market-research pipeline. Two agents entered a request ping-pong loop in production. It ran for 11 days. The bill was $47,000. Nobody noticed until it was over.

Every company scaling agents has a smaller version of this story: runs that should cost $0.40 costing $12, multiplied across thousands of executions, invisible until the invoice. Observability tools show the fire after the house burned down. Efficiency techniques (caching, routing, pruning) lower the average but do nothing about the tail — and with 30x variance, **the tail is the bill.**

## 3. Product principles (non-negotiable)

1. **Enforcement over observation.** Anything that only reports is a receipt. Our value metric is *spend that didn't happen*. Every feature must trace to preventing, bounding, or degrading spend — or to earning the trust required to be allowed to do so.
2. **Degrade before you die.** Tripping is a ladder, not a wall: at 80% of budget → cheaper model, narrower toolset, shorter context; at 100% → graceful stop with partial results; hard kill only as the last rung. A run that finishes at $9 beats a run killed at $50.
3. **Trust is the product.** We ask companies to let our software stop their production workloads. A false trip on a legitimate $10k customer-facing run is worse than the waste we prevent. Therefore: **shadow mode first** (log what *would* trip before enforcing anything), explainable trips (every trip shows its ledger trail), and override paths with audit. No enforcement feature ships without its shadow-mode twin.
4. **Enforcement lives in the execution path.** LangGraph node boundaries, Claude Code PreToolUse/UserPromptSubmit hooks, SDK middleware, gateway proxy. A policy that lives beside the workload cannot stop it at 3 a.m.
5. **Two-speed accounting.** Enforcement decisions run on a fast local counter (sub-millisecond, approximate). A reconciliation loop trues it up against OTel/billing ground truth and surfaces drift. Fast enough to sit in the hot path, accurate enough to trust with money — this is the hard problem and the moat.
6. **Policies belong to humans, not YAML.** The budget owner types "cap research agents at $50/day per tenant, alert me at 80%, kill any single run over $5" — the system compiles it to enforcement rules, shows a preview, and deploys on confirmation. Natural language in, guaranteed guardrail out.
7. **Open core.** The breaker primitives and all adapters are open source forever — that's distribution, credibility, and the standard we want to set. The control plane (multi-tenant ledger, policy engine, NL builder, FinOps views, RBAC, audit) is the commercial product.

## 4. Competitive landscape (honest, named)

The enforcement idea is in the air — Oracle publishes reference architectures describing degradation ladders, and "circuit breaker for agents" appears in vendor content across the space. Nobody has assembled the whole product. Current players and their gaps:

| Player | What they have | The gap |
|---|---|---|
| **AgentBudget** (agentbudget.dev) | One-line session dollar limit, auto-tracking, circuit breaking, nested budgets, multi-provider | Session-scoped wrapper. No control plane, no multi-tenant ledger, no reconciliation, no policy language, no framework-native trip points. Owns the "one-liner" — we should not fight for that square. |
| **Alephant** | Proxy with Budget Circuit Breaker (alert 70% / throttle 90% / kill 100%), thrashing detection, per-agent attribution, efficiency grading | Requires routing all traffic through their proxy. Proxy-level granularity only — cannot degrade *inside* a workflow (swap model at node 7, narrow tools mid-run). Their waste-grading ideas are good; study them. |
| **Runyard** | Swarm/agent/task layered token budgets with breakers | Bound to their own swarm runtime. Not a neutral layer for LangGraph/Claude Code/custom stacks. |
| **LiteLLM / gateways** | Key/user/team max_budget on the proxy | A cautionary tale, not just a competitor: public issue tracker shows budget limiters instantiated but never registered (#27381), team-key bypasses (#12905), and regressions where spend continues past the cap (#26672). Proof of demand *and* proof that enforcement bolted onto a router as feature #47 doesn't get engineered to be trustworthy. |
| **Langfuse / Helicone / LangSmith / Datadog / CloudWatch Insights** | Best-in-class spend observability | Read-only by architecture. They tell you what you spent. Partners more than competitors — we should ingest from and export to them. |
| **Falconer / knowledge layers** | Upstream prevention: better retrieval → shorter loops | Shifts the cost distribution's median; cannot bound its tail. Complementary — the mature stack is prevent + observe + **enforce**, and we are layer three. |
| **Anthropic / OpenAI native caps** | Org-level hard caps | Blunt instruments: no per-workflow granularity, no degradation, single-provider. We build *on* their surfaces (Claude Code hooks, OTel) as a complement; multi-provider policy depth is the defense. |

**The unclaimed square** — and Breakerbox's definition:

> **Framework-native enforcement** (inside the loop, not just in front of it)
> **+ degradation ladders** (not binary kill switches)
> **+ reconciled multi-tenant ledger** (enforcement you can trust with money)
> **+ policies in plain language** (owned by the budget holder, not the YAML holder)
> **+ shadow mode and audit** (trustworthy enough for production)

No player above has more than one of these five. The product is the combination.

## 5. Target users & buyers

- **Land (bottom-up):** platform / AI-infra engineers at agent-heavy startups and scale-ups. They feel the pain (they get the Slack message when the bill spikes), they adopt OSS, they can install `breakerbox` in an afternoon.
- **Expand (top-down):** the emerging AI-FinOps / engineering-finance owner. They own the number, they buy the control plane, they need attribution, chargeback, audit, and the NL policy builder (they will never write YAML).
- **Qualifying question for discovery:** *"Has an agent ever burned money unexpectedly — and what did you do about it?"* Teams that built an ugly internal version are the buy signal.

## 6. Architecture (target state)

```
  Adapters (OSS)                          Control Plane (commercial)
┌───────────────────────────────┐       ┌────────────────────────────────────┐
│ LangGraph node interceptor    │       │ LEDGER: durable, dimensioned spend │
│ Claude Code hooks + OTel      │       │  (tenant/project/user/agent/model/ │
│ OpenAI Agents SDK middleware  │ ────▶ │   run/node), event-sourced         │
│ Raw SDK wrappers              │       │ POLICY ENGINE: budgets, ladders,   │
│ Gateway/proxy mode (Phase 3)  │       │  schedules, anomaly & trajectory   │
└───────────────────────────────┘       │  rules (token-rate signatures,     │
   │  fast path: local counter          │  stuck-loop shapes)                │
   ▼  <1ms decision                     │ NL POLICY BUILDER: text → compiled │
 ALLOW / DEGRADE / TRIP                 │  rule → preview → deploy           │
   │                                    │ FINOPS VIEWS: attribution, waste   │
   └─ slow path: reconcile vs           │  detection, chargeback, forecasts  │
      OTel/billing truth, surface       │ TRUST LAYER: shadow mode, trip     │
      drift                             │  explanations, overrides, audit    │
                                        └────────────────────────────────────┘
```

Key technical decisions to hold:
- **Ledger is event-sourced** (append-only spend events; budgets are projections). Enables audit, replay, and reconciliation by construction.
- **Trip decisions are explainable objects**, not booleans: `{policy, threshold, counter_value, confidence, ladder_rung, override_url}`.
- **Every adapter emits the same event schema** (OTLP-compatible) so the ledger is adapter-agnostic and third parties can build adapters.
- **Subscription-plan workloads** (Claude Max etc.) have no marginal dollar cost → meter tokens and apply org rate cards; dollar-true enforcement targets API/Bedrock/Vertex spend.

## 7. Roadmap

### Phase 0 — The primitive people trust (now → +6 weeks)
*Theme: sharpest OSS wedge, demo-able in 60 seconds.*

- **P0.1** Harden the LangGraph breaker: degradation ladder v1 (model swap + tool narrowing at threshold), graceful-stop with partial results, trip-explanation objects.
- **P0.2** **Shadow mode** as a first-class flag: run any policy in observe-only, produce a "what would have tripped this week" report. This is the adoption unlock — nobody enables enforcement on day one.
- **P0.3** **`breakerbox claudecode init`**: one command that installs Claude Code hooks (UserPromptSubmit budget check, PreToolUse trip on Task/Bash near ceiling, Stop reconciliation) + optional OTel wiring to a local collector. Session and daily ceilings.
- **P0.4** Launch content: publish the "agents can't predict their own spend" guide (EN + HE), demo video of a runaway loop getting tripped, honest comparison page naming AgentBudget/Alephant/LiteLLM.
- **Exit criteria:** 500+ stars, 20+ real installs, ≥10 inbound conversations. *This phase is lead generation for everything below.*

### Phase 1 — Proof of demand (+6 weeks → +4 months)
*Theme: find out if anyone pays for enforcement. Go/no-go gate for the company.*

- **P1.1** 15–20 discovery interviews with spend owners (platform leads, CTOs at agent startups, FinOps at Claude Code fleet adopters). Log verbatim answers to the qualifying question.
- **P1.2** Thin hosted slice for 3–5 design partners: their adapters → single-tenant ledger → live spend view → **one enforced policy each**, started in shadow mode, graduated to enforcement.
- **P1.3** Co-founder search (GTM/product gap), sourced from network + the people these interviews surface. A design partner who gets obsessed is a candidate.
- **Exit criteria (the gate):** 3–5 design partners with enforcement *actively on* (not shadow, not dashboard-only). If this fails, Breakerbox stays a respected OSS library and a portfolio asset — also a fine outcome.

### Phase 2 — Control plane MVP (+4 → +10 months)
*Theme: the product. Requires co-founder or full-time commitment — do not attempt solo on nights and weekends.*

- **P2.1** Multi-tenant event-sourced ledger + reconciliation loop (OTel/billing ingestion, drift surfacing).
- **P2.2** Policy engine v1: budgets, ceilings, ladders, scheduled resets, per-dimension scoping.
- **P2.3** **NL policy builder v1**: text → compiled rule → human-readable preview → deploy. Thin but real; measure whether it's genuinely used vs. demo candy.
- **P2.4** FinOps views v1: attribution, chargeback export, waste detection (accuracy-saturation heuristics, token-rate trajectory signatures for stuck loops — healthy agents pause for I/O; sustained high-velocity token burn with no progress is a loop signature).
- **P2.5** Trust layer v1: org-wide shadow mode, trip audit trail, override with reason-capture.
- **P2.6** First paid tier. Pricing anchored to **enforced spend under management**, not seats.
- **Exit criteria:** design partners converted to paying; first outside logos; pre-seed raised or a deliberate bootstrap decision.

### Phase 3 — The category (+10 → +18 months)
*Theme: "AI Spend Control Plane" as a named layer of the stack.*

- **P3.1** Gateway/proxy mode for server-side enforcement (the enterprise requirement where client-side hooks aren't trusted).
- **P3.2** Fleet governance: policy inheritance, RBAC, SSO, full audit (who raised which ceiling, when — the compliance sale).
- **P3.3** Adapter breadth: OpenAI Agents SDK, Bedrock Agents, CI/CD agent runs, MCP-level metering. Publish the adapter spec; let the ecosystem build.
- **P3.4** Forecasting on the ledger: trajectory-based spend projection, what-if on routing/policies.
- **P3.5** Partnerships with observability players (ingest/export) — their read-only architecture makes us complementary, and every integration cements the category.

## 8. Business model

- **OSS (free forever):** breakers, adapters, shadow mode, single-node local mode.
- **Cloud:** hosted control plane, tiered by enforced monthly spend under management.
- **Enterprise:** VPC/self-hosted, SSO/RBAC/audit, gateway mode, SLAs.
- **Anchor metric:** spend prevented. If Breakerbox stops even 5–10% of an agent budget from being wasted past the accuracy-saturation point, ROI is self-evident at any meaningful spend level. Report it on every dashboard: *"Breakerbox prevented $X this month."*

## 9. Success metrics

| Horizon | Metric |
|---|---|
| Phase 0 | Stars, installs, inbound conversations, shadow-mode reports generated |
| Phase 1 | Design partners with enforcement ON; verbatim willingness-to-pay signals |
| Phase 2 | Paying teams; enforced spend under management; $ prevented; false-trip rate (< agreed SLO) |
| Phase 3 | Logos; category language adoption ("spend control plane", "breaker for agents") in the wild |

**North-star:** dollars of enforced spend under management. **Guardrail metric:** false-trip rate — trust, once lost, doesn't come back.

## 10. Open questions (resolve with design partners, not in this doc)

1. Client-side hooks vs. server-side gateway — where do enterprises *require* enforcement to live? (Sequences P3.1.)
2. Land-with-eng / expand-to-finance — validate, don't assume.
3. How long do teams stay in shadow mode before trusting enforcement? (Defines the activation funnel.)
4. NL policy builder: genuinely used, or demo candy? Ship thin, instrument, decide.
5. Does "spend prevented" survive contact with skeptical buyers as the pricing anchor, or do we fall back to volume tiers?

## 11. Risks, stated plainly

- **AgentBudget grows a control plane** → our answer: framework-native depth + ledger trust; move fast on Phase 0.3 (Claude Code) where they have nothing.
- **A gateway does enforcement well** → LiteLLM's track record suggests bolt-on enforcement stays broken, but Portkey-class players are competent; the defense is in-workflow degradation they architecturally can't do from a proxy.
- **Providers ship good-enough native caps** → stay multi-provider, policy-rich, and complementary (build on hooks/OTel, never against them).
- **Solo-founder clock** → Phase 2 is gated on team/commitment, explicitly. The roadmap survives Amit taking a job through Phase 1.
- **False trips kill trust before we earn it** → shadow-mode-first is a principle (§3.3), not a feature request.

---

*Amit Margalit · July 2026 · Living document — update the landscape table quarterly; the principles should barely move.*
