"""#T1 observe mode — guard(app) with no budget records real costs and enforces nothing.

The zero-config on-ramp: `guard(app)` with no budget meters every hop and enforces nothing;
`breakerbox observe-report` turns the recordings into a suggested budget. Reuses the shadow path
with unreachable thresholds, so the enforcement hot path is untouched — these tests pin that observe
records but never trips, even on a runaway.
"""

from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import BudgetKilled, guard
from breakerbox.pricing import cost_microusd

MODEL = "openai/gpt-4o"
COST = cost_microusd(MODEL, 100, 50)  # 750 micro/call


class FakeModel(BaseChatModel):
    model: str = MODEL

    @property
    def _llm_type(self) -> str:
        return "fake-observe"

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


def test_observe_records_costs_and_never_trips(tmp_path):
    # guard(app) with NO budget = observe. A run that would trip a tiny budget in enforce mode
    # instead runs to completion and records real per-hop costs.
    guarded = guard(build(5), report_dir=tmp_path)
    result = guarded.invoke({"count": 0})
    assert result["count"] == 5  # ran to completion — nothing enforced
    run = _only_run(guarded)
    assert run.ledger.total_spent() == pytest.approx(5 * COST)  # 5 model calls metered
    reconciles = [e for e in run.eventlog.events if e.type == "reconcile"]
    assert reconciles and all(e.actual_microusd is not None for e in reconciles)
    # no policy → nothing trips and nothing would-trips
    assert not [e for e in run.eventlog.events if e.type in ("trip", "would_trip")]
    assert not run.would_tripped


def test_observe_survives_a_runaway_loop(tmp_path):
    # a 20-call runaway completes under observe (thresholds unreachable); costs still recorded.
    guarded = guard(build(20), report_dir=tmp_path)
    result = guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert result["count"] == 20
    assert _only_run(guarded).ledger.total_spent() == pytest.approx(20 * COST)


def test_observe_start_event_reports_no_budget(tmp_path):
    guarded = guard(build(1), report_dir=tmp_path)
    guarded.invoke({"count": 0})
    start = next(e for e in _only_run(guarded).eventlog.events if e.type == "start")
    assert start.detail["budget_micro"] is None  # honest: observe has no budget
    assert start.detail["max_hops"] is None


def test_observe_needs_no_checkpointer_despite_default_pause(tmp_path):
    # on_trip defaults to "pause" (normally needs a checkpointer); observe must not require one —
    # a fresh user has no checkpointer and no budget and must still be able to just run.
    guarded = guard(build(1), report_dir=tmp_path)
    assert guarded.invoke({"count": 0})["count"] == 1


def test_enforce_still_trips_where_observe_would_not(tmp_path):
    # contrast: same graph, a real tiny budget + kill → raises. Proves observe != enforce.
    guarded = guard(
        build(5), budget_usd=round(2 * COST / 1e6, 6), on_trip="kill", report_dir=tmp_path
    )
    with pytest.raises(BudgetKilled):
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
