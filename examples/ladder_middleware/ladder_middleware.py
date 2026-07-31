"""#150 — a custom degradation *ladder* on a LangChain 1.x agent, end to end.

Instead of a binary kill at 100% of budget, cumulative spend climbs a series of **rungs**, each
prescribing a *less drastic* action than stopping:

    70%  -> swap to a cheaper model
    85%  -> stay swapped AND narrow the toolset to just `search`
    100% -> graceful stop, hand back partial results

`BreakerboxMiddleware.wrap_model_call` is the only front-end that can *rewrite the request*, so this
is where MODEL_SWAP / TOOL_NARROW actually fire (the guard() callback records them as advisory).

Runs OFFLINE with two fake models (no API key, deterministic) so it can live in CI. Both fakes price
identically, so the spend climbs a clean 1/N per hop and the transcript is easy to read — a *real*
cheaper model would also cut each hop's cost, savings on top of the swap.

    pip install 'breakerbox[langchain1]'
    python examples/ladder_middleware/ladder_middleware.py
"""

from __future__ import annotations

import json

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool

from breakerbox.ladder import Ladder, Rung, budget_decision
from breakerbox.ladder import LadderAction as A
from breakerbox.middleware import BreakerboxMiddleware, _narrow_tools
from breakerbox.pricing import MICRO_PER_USD, cost_microusd
from breakerbox.tripwire import TripReason

MODEL = "openai/gpt-4o"
COST_PER_CALL = cost_microusd(MODEL, 100, 50)  # deterministic micro/call, no API key
BUDGET_USD = round(7 * COST_PER_CALL / MICRO_PER_USD, 6)  # ~7 hops to exhaust → crosses every rung


class FakeModel(BaseChatModel):
    """A deterministic looping model that tags its output so you can SEE which model ran.

    Prices as MODEL regardless of `label` (uniform, readable climb). Keeps tool-calling `search`
    forever — it's the ladder, not a stop-condition, that ends the run.
    """

    label: str = "primary"

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        hop = sum(1 for m in messages if isinstance(m, AIMessage)) + 1
        return ChatResult(generations=[ChatGeneration(message=AIMessage(
            content=f"[{self.label}] hop {hop}",
            tool_calls=[{"name": "search", "args": {"query": "x"}, "id": f"call_{hop}"}],
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
            response_metadata={"model_name": MODEL},
        ))])

    def bind_tools(self, tools, **kwargs):
        return self


@tool
def search(query: str) -> str:
    """Cheap web search — the tool we keep when the ladder narrows."""
    return "ok"


@tool
def deep_research(topic: str) -> str:
    """Expensive research — the tool the 85% rung drops."""
    return "ok"


# The custom ladder. Each rung is SELF-CONTAINED (rung_for returns the single highest rung <=
# the spend fraction), so the 85% rung repeats MODEL_SWAP to stay swapped while it also narrows.
LADDER = Ladder(rungs=(
    Rung(0.70, (A.MODEL_SWAP,), swap_model="openai/gpt-4o-mini"),
    Rung(0.85, (A.MODEL_SWAP, A.TOOL_NARROW),
         swap_model="openai/gpt-4o-mini", keep_tools=("search",)),
    Rung(1.00, (A.GRACEFUL_STOP,)),
))


def build_agent(budget_usd: float):
    """A normal LangChain 1.x agent + BreakerboxMiddleware carrying the ladder.

    `ladder` is the policy; `swap_model` is the actual cheaper *instance* the middleware overrides
    to on a MODEL_SWAP rung (the Rung's string id is for the receipt/decision).
    """
    bbx = BreakerboxMiddleware(
        budget_usd=budget_usd,
        model=MODEL,
        ladder=LADDER,
        swap_model=FakeModel(label="cheap"),  # the cheaper model INSTANCE
    )
    return create_agent(FakeModel(label="primary"), tools=[search, deep_research], middleware=[bbx])


def run_demo(budget_usd: float = BUDGET_USD):
    """Invoke the guarded agent. Returns (messages, decision_dict|None, per_hop_model_labels)."""
    agent = build_agent(budget_usd)
    result = agent.invoke({"messages": [HumanMessage("research forever")]}, {"recursion_limit": 40})
    msgs = result["messages"]
    labels = ["cheap" if "[cheap]" in (m.content or "") else "primary"
              for m in msgs if isinstance(m, AIMessage) and m.tool_calls]
    decision = next(
        ((m.additional_kwargs or {}).get("breakerbox") for m in msgs
         if isinstance(m, AIMessage) and (m.additional_kwargs or {}).get("breakerbox")),
        None,
    )
    return msgs, decision, labels


def _selfcheck() -> None:
    """The ladder policy is pure — assert it offline, no agent, no spend."""
    assert LADDER.rung_for(0.50) is None
    assert LADDER.rung_for(0.70).actions == (A.MODEL_SWAP,)
    assert LADDER.rung_for(0.86).has(A.TOOL_NARROW)
    assert LADDER.rung_for(1.00).actions == (A.GRACEFUL_STOP,)
    assert [t.name for t in _narrow_tools([search, deep_research], ("search",))] == ["search"]
    d = budget_decision(TripReason.BUDGET, 7 * COST_PER_CALL, 7 * COST_PER_CALL, ladder=LADDER)
    assert d.action is A.GRACEFUL_STOP and d.policy == "ladder:graceful_stop@1.00"


def main() -> None:
    _selfcheck()
    _, decision, labels = run_demo()
    print("=" * 66)
    print("  Breakerbox degradation ladder × LangChain 1.x middleware")
    print(f"  budget ${BUDGET_USD:.5f} · 70% swap · 85% swap+narrow · 100% graceful stop")
    print("=" * 66)
    prev = "primary"
    for i, label in enumerate(labels, start=1):
        frac = (i - 1) * COST_PER_CALL / (7 * COST_PER_CALL)  # spend fraction at call time
        note = "  ← MODEL_SWAP" if label == "cheap" and prev == "primary" else ""
        print(f"  hop {i}: {label:<7} at {frac:4.0%} of budget{note}")
        prev = label
    cheap_hops = sum(1 for x in labels if x == "cheap")
    print(f"  ⏻ graceful stop — {cheap_hops} hop(s) ran on the cheaper model")
    if decision:
        print("  explainable decision:")
        print("  " + json.dumps(decision, indent=2).replace("\n", "\n  "))


if __name__ == "__main__":
    main()
