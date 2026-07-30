# deepagents demo — Breakerbox on a modern 1.x agent (#148)

Proof that Breakerbox attaches to a **2026-era agent** (`deepagents.create_deep_agent`, built on
LangChain / LangGraph 1.x): a runaway loop is tripped at a hard dollar budget, and the trip comes
back as an **explainable decision** (`TripDecision`), not a bare boolean.

```bash
pip install 'breakerbox[langchain1]' deepagents
python examples/deepagents_demo/demo.py
```

Runs offline — a fake looping model, no API keys. One line does it:

```python
from deepagents import create_deep_agent
from breakerbox.middleware import BreakerboxMiddleware

agent = create_deep_agent(model=model, tools=tools,
                          middleware=[BreakerboxMiddleware(budget_usd=5.00)])
```

The same `middleware=[...]` slot takes a degradation ladder (`ladder=Ladder.default(...)`,
`swap_model=<cheaper model>`) to **degrade before you die** — swap to a cheaper model and narrow
tools at 80%, graceful-stop with partial results at 100% — and `shadow=True` to see what *would*
trip before enforcing anything. See `breakerbox.middleware`.
