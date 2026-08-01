"""#T1 observe-report — the cost profile + suggested budget over observe-mode recordings.

Fixtures are generated end-to-end (real observe runs written to a report dir), so the aggregation is
tested against the same JSONL guard() actually writes. Assertions are metering-agnostic — they check
relationships (per-run cost scales with loop count, median is the middle run, the cap prevents
overspend), not a hardcoded per-call price that could drift with the price table.
"""

import math
from typing import TypedDict

import yaml
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import guard
from breakerbox.observe import (
    aggregate_observe,
    prevented_micro,
    render_observe,
    suggest_policy,
    suggested_yaml,
)


class FakeModel(BaseChatModel):
    model: str = "openai/gpt-4o"

    @property
    def _llm_type(self) -> str:
        return "fake-observe-report"

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


def _observe_run(loops: int, report_dir):
    guard(build(loops), report_dir=report_dir).invoke({"count": 0}, {"recursion_limit": 100})


def _three_runs(tmp_path):
    for n in (3, 5, 10):  # per-run cost scales with loop count (uniform per-call)
        _observe_run(n, tmp_path)
    return aggregate_observe(tmp_path)


def test_profile_percentiles_drivers_and_loop_signature(tmp_path):
    s = _three_runs(tmp_path)
    assert s["runs"] == 3
    totals = s["per_run_micro"]
    assert totals == sorted(totals) and len(totals) == 3
    assert s["median_micro"] == totals[1] and s["max_micro"] == totals[2]
    assert s["p95_micro"] == totals[2]
    # uniform per-call cost → totals proportional to loop counts (3 : 5 : 10)
    assert totals[2] == 2 * totals[1] and 3 * totals[1] == 5 * totals[0]
    assert "call" in s["by_node"] and s["by_node"]["call"] > 0
    # only the 10-call run crosses the loop threshold (8)
    assert [x["calls"] for x in s["loop_signatures"]] == [10]


def test_suggested_budget_is_p95_rounded_up_with_hops(tmp_path):
    s = _three_runs(tmp_path)
    sug = suggest_policy(s)
    assert sug["budget_usd"] == math.ceil(s["p95_micro"] / 1e4) / 100  # p95 rounded up to the cent
    assert sug["budget_usd"] * 1_000_000 >= s["p95_micro"]  # a ceiling, never below p95
    assert sug["max_hops"] == 20  # 2x the busiest observed node (10 calls)


def test_prevented_counts_spend_above_the_cap(tmp_path):
    s = _three_runs(tmp_path)
    # a cap at the median prevents exactly the top run's overspend above the median
    assert prevented_micro(s, s["median_micro"]) == s["max_micro"] - s["median_micro"]
    # a cap at or above the max prevents nothing
    assert prevented_micro(s, s["max_micro"]) == 0


def test_suggested_yaml_is_a_valid_policy_file(tmp_path):
    s = _three_runs(tmp_path)
    sug = suggest_policy(s)
    doc = yaml.safe_load(suggested_yaml(s, sug))
    assert doc["max_ceiling_usd"] == sug["budget_usd"]
    assert doc["require_bounded"] is True
    assert doc["max_hops"] == 20


def test_render_shows_the_suggestion(tmp_path):
    _observe_run(5, tmp_path)
    s = aggregate_observe(tmp_path)
    out = render_observe(s, suggest_policy(s))
    assert "Suggested starting budget" in out
    assert "guard(app, budget_usd=" in out


def test_empty_dir_is_clean(tmp_path):
    s = aggregate_observe(tmp_path)
    assert s["runs"] == 0 and s["per_run_micro"] == []
    assert "No observe runs found" in render_observe(s, suggest_policy(s))


def test_enforce_runs_are_excluded_from_the_baseline(tmp_path):
    # a run with a real budget is NOT observe data — the baseline must ignore it.
    guard(build(3), budget_usd=100.0, on_trip="kill", report_dir=tmp_path).invoke({"count": 0})
    s = aggregate_observe(tmp_path)
    assert s["runs"] == 0 and s["runs_scanned"] == 1
