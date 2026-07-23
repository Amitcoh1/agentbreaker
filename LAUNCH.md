# Launch checklist

Outward-facing steps — these are yours to run (I can't publish or post for you). The product
positioning: **a visual agent builder that generates Python and runs nothing server-side —
no stored keys, budget-first.** Every public claim must map to a row in the README comparison
table (the honesty rule at the bottom).

## Pre-flight (the week of launch — facts move)

- [ ] **Re-verify the competitor facts.** They're the thing that gets fact-checked on HN in
      the first hour. Confirm each is still accurate:
      - The Langflow CVEs cited in `README.md` / `docs/blog/why-no-run-button.md`
        (**CVE-2025-3248, CVE-2025-34291, CVE-2026-33017, CVE-2026-5027**) — check CISA KEV +
        the vendor advisories still say what we say (CVSS, KEV status, exploitation). Fix any
        drift *before* posting.
      - Langflow star count / backing (we say "~100k+, IBM/DataStax") and that flows still
        export to LangChain Python.
      - LiteLLM: still a proxy that holds provider keys, with flat per-key/session budgets
        (`max_budget`, `max_budget_per_session`). If they shipped hierarchical per-agent
        escrow, soften that comparison row.
- [ ] **Refresh `prices.json`** with `breakerbox update-prices`; spot-check headline models.
- [ ] Confirm PyPI name is free (`pip index versions breakerbox`); fallback:
      `agent-breaker`, `langgraph-breaker`. Set the real repo URL in `pyproject.toml`
      (`[project.urls]`).
- [ ] **Record the 60s builder demo** per `docs/demo-script.md`: drag → Budget Tree fills →
      over-allocate → **red block** → fix → Generate → Python → run locally → receipt. This is
      the single most important asset — the over-allocation red-block is the money shot.
- [ ] Screenshot the **Budget Tree** and a **receipt** for the README and the Show HN post.

## Build & publish to PyPI

**Automated (preferred):** `.github/workflows/publish.yml` builds, re-runs lint + tests, and
publishes on a `v*` tag via **Trusted Publishing** (OIDC — no stored token). CI also runs the
dashboard job (typecheck/lint/**Python↔TS codegen parity**/build), so a green tag means both
the library and the builder are verified. One-time setup:

1. On PyPI: add a *pending publisher* (owner/repo, workflow `publish.yml`, environment `pypi`).
2. On GitHub: create an environment named `pypi`.
3. `git tag v0.1.0 && git push --tags`.

**Manual fallback:**

```bash
pip install build twine
python -m build && twine check dist/*
twine upload --repository testpypi dist/*   # smoke-test the install in a clean venv first
twine upload dist/*
```

## Show HN — three title options (all factual, none dunk)

1. `Show HN: Breakerbox – a visual agent builder that generates Python and runs nothing server-side`
2. `Show HN: Budget-first agent builder – draw a graph, get guarded LangGraph Python, no stored keys`
3. `Show HN: We removed the Run button from our agent builder (no server execution, no key storage)`

Lead the post with the demo GIF and the comparison table. Be in the thread for the first few
hours. When someone asks *"how is this different from LiteLLM `max_budget_per_session`?"*,
answer with the table row (flat session vs. hierarchical per-agent escrow), not a wall of text.

## r/LangChain post draft

> **Title:** A codegen-only visual builder for LangGraph — no server runs your flow, budgets on the canvas
>
> I kept seeing two problems with agent tooling: (1) runaway loops quietly burning money, and
> (2) visual builders that execute your flows server-side and store your provider keys have
> been a repeated RCE target (four public, CISA-KEV Langflow CVEs in <18 months).
>
> Breakerbox is my take on avoiding both. You build a LangGraph workflow on a canvas, and it
> **generates plain, editable Python** wrapped in a hierarchical dollar budget (`guard()`).
> Nothing runs on a server; your keys stay in your own environment. The builder has a live
> **Budget Tree** — over-allocate a node's sub-budget past the parent and it blocks export.
> At runtime the guard stops a runaway at a hop boundary (never mid-call) and writes a receipt.
>
> It composes with LangGraph directly and sits alongside a gateway (LiteLLM/Portkey) rather
> than replacing it. Repo + a "why no Run button" write-up in the comments. Honest feedback
> welcome — especially on the codegen output; it's meant to be code you'd enjoy editing.

## LinkedIn post draft (you'll translate to Hebrew)

> Two things kept biting AI teams this year: agents looping and quietly burning money, and
> visual "flow builders" that run your graphs server-side — a pattern behind a string of
> actively-exploited RCEs and stolen API keys.
>
> So I built Breakerbox differently. It's a visual agent builder that **generates Python you
> run yourself** — there's no server executing your flow and no place we store your keys, so
> there's nothing to breach. And budgets are first-class: you set a hard dollar limit on the
> canvas, over-allocation is blocked before you can export, and a runaway stops at a safe
> boundary with a receipt showing exactly where the money went.
>
> Open source, MIT. Prototype anywhere; ship the production-safe version. Link in comments.

## Honesty rule

Every claim in every post must map to a row in the README comparison table, which maps to a
public fact. Avoid **unqualified** security absolutes — always pair the claim with its specific
reason: *"nothing to hack **because** there's no server execution and no stored keys"* (true and
grounded), not a bare *"unhackable."* The README headline is fine precisely because it's
immediately qualified that way. If a fact can't be re-verified the week of launch, drop it.

## Kill criteria (be honest)

If 60 days post-launch there are <100 GitHub stars and no organic usage, freeze it as a
portfolio asset and stop investing.
