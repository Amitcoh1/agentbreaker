# Roadmap

Breakerbox has one job: make agent workflows safe to run — a hard dollar budget on the
workflow itself, a stop that never corrupts state, and code you own. This roadmap says where
that's going. It's a statement of direction, not a delivery contract: order and timing will
shift based on what users actually need. Issues and milestones on this repo are the source of
truth for what's in flight.

The core library is MIT-licensed and stays that way. Forever.

## Now — Launch

- [x] Hierarchical budget escrow (reserve → reconcile, parent→child allocation)
- [x] Graceful trip at hop boundaries: `pause` (resumable) / `kill` — never a mid-flight 429
- [x] Self-metering (local token counting + stream metering, provider `usage` cross-check)
- [x] Live model pricing pulled from the community table (`breakerbox update-prices`)
- [x] The receipt: terminal summary + self-contained HTML report per run, leading with the
      real number (stopped at $Y / budget $Z), projection as labelled fine print
- [x] Framework-agnostic graph spec + validator + `breakerbox build` / `validate` CLI
- [x] Visual builder: drag-and-drop graph → readable, guard-wrapped Python (codegen only —
      see "What we won't build")
- [x] Budget Tree: allocate per-agent budgets on the canvas; over-allocation blocks export
- [ ] v1.0 on PyPI

## Next — Going deeper

- [ ] **CI Budget Gate** — a GitHub Action that runs your agent tests and fails the PR if
      projected cost exceeds your limit, with the receipt as a PR comment. Your agent's cost
      becomes a unit test.
- [ ] **CrewAI adapter** — the graph spec is framework-agnostic by design; LangGraph is
      first, not last.
- [ ] **OpenTelemetry GenAI export** — per-hop spans in standard semantic conventions, so
      receipts land in the observability stack you already run (Datadog, Grafana, Langfuse, …).
- [ ] **Gateway composability** — documented, tested setups running Breakerbox behind
      LiteLLM / Portkey / others: your gateway caps the org, Breakerbox governs the
      workflow. Complements, not competitors.
- [ ] **Policy templates** — `breakerbox init --template research-agent`: prewired budgets,
      velocity limits, and side-effect tags for common agent patterns.
- [ ] **Shareable receipts** — one link to a run's timeline.

## Later — Exploring

- **Side-effect safety kit** — idempotency-key helpers for side-effecting tools, and a
  compensation checklist on the receipt when a run stops after side effects fired.
- **Policy-as-code** — `breakerbox.yaml` versioned in git: budgets and trip rules reviewed
  like code, enforced in CI and at runtime.
- **More frameworks** — adapters follow where the ecosystem goes.
- **Team features** — shared run history, alerts on trip, team budget policies. These ship
  when users ask for them, not before. If a hosted team tier ever exists, the library and
  builder stay free and MIT.

## What we won't build

This list is as load-bearing as the one above.

- **No server-side execution of your graphs. Ever.** No run button, no hosted runtime, no
  sandbox. A server that executes user-defined flows is an attack surface; we removed it by
  design. Your code runs on your machine.
- **No storing your provider API keys. Ever.** Not in a dashboard, not encrypted, not "just
  for convenience." Your keys stay where they already live — with you.
- **No LLM supervising your LLM in the hot path.** Enforcement is deterministic accounting:
  reservations, ceilings, velocity. Auditable, fast, and not promptable.
- **No general-purpose builder ambitions.** No integration marketplace, no RAG component
  library, no chat playground. Other tools do breadth well. We do one thing: your agents
  can't outspend the budget you set.

---

Have a use case that doesn't fit this map? Open an issue — the "Next" list above got its
order from exactly that kind of input.
