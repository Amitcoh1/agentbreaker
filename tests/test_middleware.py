"""#146 Phase 1 — BreakerboxMiddleware on a real LangChain 1.x agent.

Skipped unless langchain>=1 is installed (`pip install 'breakerbox[langchain1]'`), so the
langchain-core 0.3 test suite / CI is unaffected. Run against 1.x it proves a runaway agent trips
at budget and a bounded agent runs clean.
"""

import pytest

pytest.importorskip("langchain.agents.middleware")  # langchain 1.x only

from langchain.agents import create_agent  # noqa: E402
from langchain_core.language_models import BaseChatModel  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from langchain_core.outputs import ChatGeneration, ChatResult  # noqa: E402
from langchain_core.tools import tool  # noqa: E402

from breakerbox.middleware import BreakerboxMiddleware, BudgetTripped  # noqa: E402
from breakerbox.pricing import cost_microusd  # noqa: E402

MODEL = "openai/gpt-4o"
COST = cost_microusd(MODEL, 100, 50)  # 750 micro = $0.00075 per call


def _msg(with_tool: bool, n: int) -> AIMessage:
    return AIMessage(
        content="working..." if with_tool else "done",
        tool_calls=[{"name": "noop", "args": {}, "id": f"call_{n}"}] if with_tool else [],
        usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        response_metadata={"model_name": MODEL},
    )


class _Model(BaseChatModel):
    """A fake model; loops forever (always tool-calls) or stops (never tool-calls)."""

    loops: bool = True

    @property
    def _llm_type(self) -> str:
        return "fake-loop"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = sum(1 for m in messages if isinstance(m, AIMessage))
        return ChatResult(generations=[ChatGeneration(message=_msg(self.loops, n))])

    def bind_tools(self, tools, **kwargs):
        return self


@tool
def noop() -> str:
    """does nothing, returns ok"""
    return "ok"


def _agent(loops: bool, **mw):
    model = _Model()
    model.loops = loops
    return create_agent(model=model, tools=[noop], middleware=[BreakerboxMiddleware(**mw)])


def _trips(msgs):
    return [m for m in msgs if isinstance(m, AIMessage) and "tripped" in (m.content or "")]


def test_runaway_agent_trips_at_budget():
    agent = _agent(True, budget_usd=round(3 * COST / 1e6, 6), model=MODEL)
    result = agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 50})
    msgs = result["messages"]
    calls = sum(1 for m in msgs if isinstance(m, AIMessage) and m.tool_calls)
    notices = _trips(msgs)
    assert notices and "budget" in notices[-1].content  # tripped, for the right reason
    assert calls < 50  # the gate stopped it early, well short of recursion_limit
    assert calls <= 5


def test_bounded_agent_runs_clean():
    # a model that never tool-calls ends after one hop; a generous budget never trips.
    agent = _agent(False, budget_usd=1.00, model=MODEL)
    result = agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 50})
    assert not _trips(result["messages"])


def test_exit_behavior_error_raises():
    agent = _agent(True, budget_usd=round(2 * COST / 1e6, 6), model=MODEL, exit_behavior="error")
    with pytest.raises(BudgetTripped) as exc:
        agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 50})
    assert exc.value.reason == "budget"
