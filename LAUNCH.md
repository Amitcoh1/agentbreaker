# Launch checklist

Outward-facing steps — these are yours to run (I can't publish or post for you).

## Pre-flight (the week of launch)

- [ ] **Re-verify `prices.json`** against each provider's current pricing page. This is the
      one thing that gets fact-checked on HN within the hour. Bump the `version` date.
- [ ] **Re-verify the uniqueness claim.** Search the LangGraph ecosystem + recent LiteLLM
      releases for framework-native hierarchical escrow with pause/resume. If someone shipped
      it, soften the README's comparison table before posting.
- [ ] Set the real repo URL in `pyproject.toml` (`[project.urls]`) and README badges.
- [ ] Pick the actual PyPI name — confirm `agentbreaker` is free (`pip index versions
      agentbreaker`); have a fallback (`agent-breaker`, `langgraph-breaker`).
- [ ] Record a <60s screen capture of `python examples/runaway_demo/demo.py` +
      opening `report.html`. This is the single most important asset.
- [ ] Screenshot the receipt HTML for the README and the Show HN post.

## Build & publish to PyPI

**Automated (preferred):** `.github/workflows/publish.yml` builds, re-runs lint+tests, and
publishes on a `v*` tag via **Trusted Publishing** (OIDC — no stored token). One-time setup:

1. On PyPI: add a *pending publisher* for the project (owner/repo, workflow `publish.yml`,
   environment `pypi`).
2. On GitHub: create an environment named `pypi`.
3. Then: `git tag v0.1.0 && git push --tags` — CI does the rest.

**Manual fallback:**

```bash
pip install build twine
python -m build && twine check dist/*
twine upload --repository testpypi dist/*   # smoke test in a clean venv first
twine upload dist/*
```

## Post

- [ ] **Show HN** — title like *"AgentBreaker – stop a LangGraph agent from burning money
      (in-process, no proxy)"*. Lead with the demo GIF and the honest comparison table.
      Be present in the thread for the first few hours.
- [ ] **r/LangChain** and the LangChain Discord / community.
- [ ] **X / LinkedIn** — the receipt screenshot + the one-liner.
- [ ] Answer the inevitable *"how is this different from LiteLLM `max_budget_per_session`?"*
      with the comparison table, not a wall of text.

## Kill criteria (be honest)

If 60 days post-launch there are <100 stars and no organic usage, freeze it as a portfolio
asset and stop investing. (Spec §7.)
