"""#151 shadow mode — observe-only enforcement + the would-trip report (guard front-end)."""

from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import BudgetKilled, guard
from breakerbox.pricing import cost_microusd
from breakerbox.report.shadow import aggregate_shadow, render_shadow
from breakerbox.tripwire import TripReason

MODEL = "openai/gpt-4o"
COST = cost_microusd(MODEL, 100, 50)  # 750 micro/call


class FakeModel(BaseChatModel):
    model: str = MODEL

    @property
    def _llm_type(self) -> str:
        return "fake-shadow"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    count: int


def build(loops: int):
    model = FakeModel()

    def call(state):
        model.invoke([HumanMessage("hi")])
        return {"count": state["count"] + 1}

    g = StateGraph(S)
    g.add_node("call", call)
    g.add_edge(START, "call")
    g.add_conditional_edges(
        "call", lambda s: END if s["count"] >= loops else "call", {"call": "call", END: END}
    )
    return g.compile()


def _only_run(guarded):
    return next(iter(guarded._runs.values()))


def test_shadow_budget_would_trip_completes_and_records(tmp_path):
    # budget = 2 calls; a 5-call run WOULD trip in enforce mode but shadow lets it finish.
    guarded = guard(build(5), budget_usd=round(2 * COST / 1e6, 6), shadow=True, report_dir=tmp_path)
    result = guarded.invoke({"count": 0})
    assert result["count"] == 5  # ran to completion — nothing was enforced
    run = _only_run(guarded)
    would = [e for e in run.eventlog.events if e.type == "would_trip"]
    assert any(e.detail["reason"] == "budget" and e.detail["shadow"] for e in would)
    assert TripReason.BUDGET in run.would_tripped  # recorded once (deduped by reason)


def test_shadow_loop_would_trip_recorded(tmp_path):
    guarded = guard(
        build(20), budget_usd=100.0, shadow=True, detect_loops=True, report_dir=tmp_path
    )
    result = guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert result["count"] == 20  # completed despite the runaway loop
    assert TripReason.LOOP in _only_run(guarded).would_tripped


def test_enforce_mode_actually_trips_where_shadow_would_not(tmp_path):
    # same config, no shadow -> it really trips: proves shadow != enforce.
    budget_usd = round(2 * COST / 1e6, 6)
    guarded = guard(build(5), budget_usd=budget_usd, on_trip="kill", report_dir=tmp_path)
    with pytest.raises(BudgetKilled):
        guarded.invoke({"count": 0}, {"recursion_limit": 100})


def test_shadow_report_aggregates_would_trips(tmp_path):
    for _ in range(2):  # two shadow runs that would each trip on budget
        guard(
            build(5), budget_usd=round(2 * COST / 1e6, 6), shadow=True, report_dir=tmp_path
        ).invoke({"count": 0})
    summary = aggregate_shadow(tmp_path)
    assert summary["runs_would_trip"] == 2
    assert summary["by_reason"].get("budget") == 2
    assert summary["would_prevent_micro"] > 0  # spend continued past budget in shadow
    assert "would have tripped" in render_shadow(summary)


def test_shadow_report_empty_dir_is_clean(tmp_path):
    # error/edge path: a dir with no would-trip logs summarises to zeros, doesn't crash.
    summary = aggregate_shadow(tmp_path)
    assert summary == {
        "runs_scanned": 0,
        "runs_would_trip": 0,
        "by_reason": {},
        "by_policy": {},
        "would_prevent_micro": 0,
        "would_prevent_usd": 0.0,
        "top_runs": [],
    }
