# AgentBreaker

**Circuit breaker + hierarchical cost budgeting for AI agent workflows.**

> Your gateway caps your org's spend. AgentBreaker governs a single workflow from the
> inside: hierarchical budgets across sub-agents, safe pause instead of a mid-flight 429,
> and a receipt showing exactly where the money went.

Drop-in middleware for LangGraph that enforces a real-dollar budget across an entire
multi-agent DAG, stops runaway loops gracefully at hop boundaries, and produces a
shareable "incident receipt" timeline. Zero infrastructure — `pip install`, wrap your
graph, done.

```python
from agentbreaker import guard

app = guard(my_langgraph_app, budget_usd=5.00, max_hops=50, on_trip="pause")
```

## Status

Early development, built phase by phase.

- [x] **Phase 0** — packaging, price table, cost calculator (microdollars)
- [ ] Phase 1 — hierarchical budget ledger & escrow
- [ ] Phase 2 — LangGraph integration (`guard()`, streaming meter, trip actions)
- [ ] Phase 3 — the HTML/JSON receipt
- [ ] Phase 4 — runaway demo, docs, PyPI launch

## Develop

```bash
pip install -e ".[dev]"
pytest -q
ruff check .
```

## License

MIT
