"""#148 — Breakerbox on a modern deepagents / LangChain 1.x agent.

Proves BreakerboxMiddleware attaches to a 2026-era agent (`create_deep_agent`), trips a runaway
loop at a hard dollar budget, and hands back an *explainable* trip decision — not a bare boolean.
Runs offline (a fake looping model), no API keys.

    pip install 'breakerbox[langchain1]' deepagents
    python examples/deepagents_demo/demo.py
"""

from __future__ import annotations

import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool

from breakerbox.ladder import Ladder, LadderAction, Rung
from breakerbox.middleware import BreakerboxMiddleware
from breakerbox.pricing import cost_microusd

MODEL = "openai/gpt-4o"
COST_PER_CALL = cost_microusd(MODEL, 100, 50)  # 750 micro/call — deterministic, no API key


class RunawayModel(BaseChatModel):
    """A fake model that never stops tool-calling — a textbook runaway loop."""

    @property
    def _llm_type(self) -> str:
        return "runaway"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = sum(1 for m in messages if isinstance(m, AIMessage))
        return ChatResult(generations=[ChatGeneration(message=AIMessage(
            content="looping...",
            tool_calls=[{"name": "noop", "args": {}, "id": f"call_{n}"}],
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
            response_metadata={"model_name": MODEL},
        ))])

    def bind_tools(self, tools, **kwargs):
        return self


@tool
def noop() -> str:
    """A no-op tool the runaway keeps calling."""
    return "ok"


def build_agent(budget_usd: float):
    """A real deepagents agent guarded by BreakerboxMiddleware with a graceful-stop ladder."""
    from deepagents import create_deep_agent

    ladder = Ladder(rungs=(Rung(1.00, (LadderAction.GRACEFUL_STOP,)),))
    return create_deep_agent(
        model=RunawayModel(),
        tools=[noop],
        middleware=[BreakerboxMiddleware(budget_usd=budget_usd, model=MODEL, ladder=ladder)],
    )


def run_demo(budget_usd: float | None = None):
    """Invoke the guarded deep agent; return (result_messages, trip_decision_dict | None)."""
    budget_usd = budget_usd or round(3 * COST_PER_CALL / 1e6, 6)
    agent = build_agent(budget_usd)
    result = agent.invoke({"messages": [HumanMessage("run forever")]}, {"recursion_limit": 40})
    decision = None
    for m in result["messages"]:
        if isinstance(m, AIMessage):
            bbx = (m.additional_kwargs or {}).get("breakerbox")
            if bbx:
                decision = bbx
    return result["messages"], decision


def main() -> None:
    budget = round(3 * COST_PER_CALL / 1e6, 6)
    messages, decision = run_demo(budget)
    hops = sum(1 for m in messages if isinstance(m, AIMessage) and m.tool_calls)
    print("=" * 62)
    print("  Breakerbox × deepagents — a runaway loop, guarded")
    print(f"  budget ${budget:.4f} · the never-ending loop stopped after {hops} hop(s)")
    print("=" * 62)
    if decision:
        print("  explainable trip decision (not a bare boolean):")
        print("  " + json.dumps(decision, indent=2).replace("\n", "\n  "))


if __name__ == "__main__":
    main()
