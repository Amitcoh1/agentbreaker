# ROADMAP

Phase-by-phase breakdown of [VISION.md](../VISION.md) §7, one file per item with acceptance criteria.
**Preserve the phase gates** — don't pull later-phase work forward without an explicit decision.
Board: `../breakerbox-roadmap.html` (phases `p0`–`p3`). After any issue op, run the **roadmap-sync** skill.

## Phase 0 — the primitive people trust (now → +6 weeks)
Sharpest OSS wedge, demo-able in 60s. Lead generation for everything below. Exit: 500+ stars / 20+ installs / ≥10 inbound.

| Item | What | Issue | File |
|---|---|---|---|
| **P0.1** | Degradation ladder v1 + explainable trips | [#150](https://github.com/Amitcoh1/agentbreaker/issues/150) | [P0.1-degradation-ladder.md](./P0.1-degradation-ladder.md) |
| **P0.2** | Shadow mode + "what would have tripped" report | [#151](https://github.com/Amitcoh1/agentbreaker/issues/151) | [P0.2-shadow-mode.md](./P0.2-shadow-mode.md) |
| **P0.3** | `breakerbox claudecode init` (hooks) | [#152](https://github.com/Amitcoh1/agentbreaker/issues/152) | [P0.3-claudecode-init.md](./P0.3-claudecode-init.md) |
| **P0.4** | Launch content: guide (EN+HE) + demo + comparison | [#153](https://github.com/Amitcoh1/agentbreaker/issues/153) | [P0.4-launch-content.md](./P0.4-launch-content.md) |

## Phase 1 — proof of demand (+6wk → +4mo)
Go/no-go gate for the company: 3–5 design partners with enforcement **actively ON**.

| Item | What | Issue | File |
|---|---|---|---|
| **P1.1** | 15–20 discovery interviews with spend owners | *non-eng milestone* | tracked in VISION §7 |
| **P1.2** | Thin hosted slice: adapters → single-tenant ledger → live view → 1 enforced policy | [#154](https://github.com/Amitcoh1/agentbreaker/issues/154) | [P1.2-hosted-slice.md](./P1.2-hosted-slice.md) |
| **P1.3** | Co-founder search (GTM/product) | *non-eng milestone* | tracked in VISION §7 |

## Phase 2 — control plane MVP (+4 → +10mo)
The product. **Requires a co-founder / full-time — do not attempt solo.** All `phase-2` issues are `backlog`/`gated` until the Phase 1 gate clears.

| Item | What | Issue | File |
|---|---|---|---|
| **P2.1** | Multi-tenant event-sourced ledger + reconciliation (two-speed accounting) | [#155](https://github.com/Amitcoh1/agentbreaker/issues/155) | [P2.1-ledger-reconciliation.md](./P2.1-ledger-reconciliation.md) |
| **P2.2** | Policy engine v1 | [#156](https://github.com/Amitcoh1/agentbreaker/issues/156) | [P2.2-policy-engine.md](./P2.2-policy-engine.md) |
| **P2.3** | NL policy builder v1 | [#157](https://github.com/Amitcoh1/agentbreaker/issues/157) | [P2.3-nl-policy-builder.md](./P2.3-nl-policy-builder.md) |
| **P2.4** | FinOps views v1 | [#158](https://github.com/Amitcoh1/agentbreaker/issues/158) | [P2.4-finops-views.md](./P2.4-finops-views.md) |
| **P2.5** | Trust layer v1 (org-wide shadow, audit, overrides) | [#159](https://github.com/Amitcoh1/agentbreaker/issues/159) | [P2.5-trust-layer.md](./P2.5-trust-layer.md) |
| **P2.6** | First paid tier (metering on enforced spend) | [#160](https://github.com/Amitcoh1/agentbreaker/issues/160) | [P2.6-first-paid-tier.md](./P2.6-first-paid-tier.md) |

## Phase 3 — the category (+10 → +18mo)

| Item | What | Issue | File |
|---|---|---|---|
| **P3.1** | Gateway/proxy mode (server-side enforcement) | [#161](https://github.com/Amitcoh1/agentbreaker/issues/161) | [P3.1-gateway-mode.md](./P3.1-gateway-mode.md) |
| **P3.2** | Fleet governance (RBAC/SSO/audit) | [#162](https://github.com/Amitcoh1/agentbreaker/issues/162) | [P3.2-fleet-governance.md](./P3.2-fleet-governance.md) |
| **P3.3** | Adapter breadth + published adapter spec | [#163](https://github.com/Amitcoh1/agentbreaker/issues/163) | [P3.3-adapter-breadth.md](./P3.3-adapter-breadth.md) |
| **P3.4** | Ledger forecasting + what-if | [#164](https://github.com/Amitcoh1/agentbreaker/issues/164) | [P3.4-ledger-forecasting.md](./P3.4-ledger-forecasting.md) |
| **P3.5** | Observability partnerships (OTLP ingest/export) | [#165](https://github.com/Amitcoh1/agentbreaker/issues/165) | [P3.5-observability-partnerships.md](./P3.5-observability-partnerships.md) |

## §6 architecture → where it's tracked
Every component of the VISION §6 target architecture maps to an item above:

| §6 component | Item / Issue |
|---|---|
| Adapters · LangGraph node interceptor | P0.1 #150 (+ existing runtime) |
| Adapters · Claude Code hooks + OTel | P0.3 #152 |
| Adapters · OpenAI Agents SDK middleware, raw SDK wrappers | P3.3 #163 |
| Adapters · Gateway/proxy mode | P3.1 #161 |
| Two-speed accounting · fast local counter | shipped (live spend counter) + P2.1 #155 |
| Two-speed accounting · slow reconcile vs OTel/billing | P2.1 #155 |
| Ledger · event-sourced, dimensioned, multi-tenant | P2.1 #155 |
| Policy engine · budgets/ladders/schedules/anomaly rules | P2.2 #156 |
| NL policy builder · text → rule → preview → deploy | P2.3 #157 |
| FinOps views · attribution/waste/chargeback/forecasts | P2.4 #158, P3.4 #164 |
| Trust layer · shadow / explanations / overrides / audit | P0.2 #151 (single-node) → P2.5 #159 (org-wide) |
| Unified OTLP-compatible event schema | P2.1 #155 (defined) → P3.5 #165 (integrations) |

## Convention
Each item file: vision ref · scope · acceptance-criteria / definition-of-done · phase-gate protection.
Verify Python: `.venv/bin/ruff check src tests && .venv/bin/pytest -q` (ruff line limit 100).
