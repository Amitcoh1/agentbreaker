# Degradation ladder × LangChain 1.x middleware

Degrade before you die. Instead of a binary kill at 100% of budget, cumulative spend climbs a
series of **rungs**, each doing something less drastic than stopping:

| Spend | Rung | Action |
|---|---|---|
| 70% | swap to a cheaper model | `MODEL_SWAP` |
| 85% | stay swapped **and** narrow tools to `search` | `MODEL_SWAP + TOOL_NARROW` |
| 100% | stop cleanly, hand back partials | `GRACEFUL_STOP` |

`BreakerboxMiddleware.wrap_model_call` is the only front-end that can *rewrite the request*, so it's
where `MODEL_SWAP` / `TOOL_NARROW` actually fire. `ladder` is the policy; `swap_model` is the actual
cheaper model **instance** the middleware overrides to.

Runs **offline** with two deterministic fake models — no API key — so it's exercised in CI
(`tests/test_ladder_middleware.py`, `test-langchain1` leg).

```bash
pip install 'breakerbox[langchain1]'
python examples/ladder_middleware/ladder_middleware.py
```

You'll watch the run start on the `primary` model, swap to `cheap` at the 70% rung, then
graceful-stop at 100% with an explainable `TripDecision`. To wire real models, swap the two
`FakeModel(...)` instances for `ChatOpenAI("gpt-4o")` and `ChatOpenAI("gpt-4o-mini")` and set a
larger `budget_usd`. See the full walk-through in [`CAPABILITIES.md`](../../CAPABILITIES.md) and the
ladder mechanics in the docs.
