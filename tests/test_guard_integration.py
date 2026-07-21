"""End-to-end guard() tests against a fake LangGraph model (no API keys).

The fake model reports provider usage (100 in / 50 out), so each call bills a
deterministic cost_microusd("openai/gpt-4o", 100, 50) = 100*2.50 + 50*10.00 = 750.
"""

from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agentbreaker import BudgetKilled, BudgetPaused, guard, mark_side_effecting
from agentbreaker.pricing import cost_microusd

MODEL = "openai/gpt-4o"
COST_PER_CALL = cost_microusd(MODEL, 100, 50)  # 750 microUSD


class FakeUsageChatModel(BaseChatModel):
    model: str = MODEL

    @property
    def _llm_type(self) -> str:
        return "fake-usage"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok ok ok",
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    count: int


def build(loops: int, checkpointer=None):
    model = FakeUsageChatModel()

    def call(state):
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["count"] >= loops else "call", {"call": "call", END: END}
    )
    return graph.compile(checkpointer=checkpointer)


def _only_run(guarded):
    return next(iter(guarded._runs.values()))


def test_meters_every_call(tmp_path):
    guarded = guard(build(3), budget_usd=100.0, on_trip="kill", report_dir=tmp_path)
    result = guarded.invoke({"count": 0})
    assert result["count"] == 3
    run = _only_run(guarded)
    assert run.ledger.total_spent() == 3 * COST_PER_CALL
    types = [e.type for e in run.eventlog.events]
    assert types.count("reserve") == 3
    assert types.count("reconcile") == 3


def test_kill_on_max_hops(tmp_path):
    guarded = guard(build(50), budget_usd=100.0, max_hops=3, on_trip="kill", report_dir=tmp_path)
    with pytest.raises(BudgetKilled) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert exc.value.reason == "hops"
    run = _only_run(guarded)
    assert [e.type for e in run.eventlog.events].count("reconcile") == 3  # stopped at hop boundary


def test_kill_on_budget_never_dispatches_over_cap(tmp_path):
    # budget smaller than a single reserve estimate -> trips before any call runs
    guarded = guard(build(50), budget_usd=0.0001, on_trip="kill", report_dir=tmp_path)
    with pytest.raises(BudgetKilled) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert exc.value.reason == "budget"
    run = _only_run(guarded)
    assert [e.type for e in run.eventlog.events].count("reconcile") == 0


def test_pause_and_resume(tmp_path):
    guarded = guard(
        build(2, MemorySaver()), budget_usd=0.0001, on_trip="pause", report_dir=tmp_path
    )
    with pytest.raises(BudgetPaused) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert exc.value.reason == "budget"
    result = guarded.resume(exc.value.checkpoint_id, extra_budget_usd=1.0)
    assert result["count"] == 2


def test_degrade_warns_and_falls_back_to_pause(tmp_path):
    with pytest.warns(UserWarning, match="graceful pause"):
        guarded = guard(
            build(2, MemorySaver()),
            budget_usd=0.0001,
            on_trip="degrade",
            degrade_model="openai/gpt-4o-mini",
            report_dir=tmp_path,
        )
    with pytest.raises(BudgetPaused):
        guarded.invoke({"count": 0}, {"recursion_limit": 100})


def test_side_effecting_tool_listed_on_kill(tmp_path):
    @tool
    def send_email(to: str) -> str:
        """Send an email (side-effecting)."""
        return "sent"

    mark_side_effecting(send_email)
    model = FakeUsageChatModel()

    def call(state):
        send_email.invoke({"to": "x"})  # fires before the model hop
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["count"] >= 5 else "call", {"call": "call", END: END}
    )
    guarded = guard(
        graph.compile(), budget_usd=100.0, max_hops=1, on_trip="kill", report_dir=tmp_path
    )

    with pytest.raises(BudgetKilled) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert "send_email" in exc.value.side_effects_fired


def test_pause_requires_checkpointer():
    with pytest.raises(ValueError, match="checkpointer"):
        guard(build(2), budget_usd=1.0, on_trip="pause")
