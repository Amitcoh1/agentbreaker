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

from breakerbox import BudgetKilled, BudgetPaused, guard, mark_side_effecting
from breakerbox.pricing import cost_microusd
from breakerbox.tripwire import TripReason

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


def test_degrade_is_not_a_valid_on_trip():
    with pytest.raises(ValueError, match="pause|kill"):
        guard(build(2), budget_usd=1.0, on_trip="degrade")  # type: ignore[arg-type]


class _BigOutputModel(BaseChatModel):
    """Returns far more output than DEFAULT_MAX_OUTPUT_TOKENS, with NO max_tokens declared."""

    model: str = "openai/gpt-4o"

    @property
    def _llm_type(self) -> str:
        return "big-output"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 100, "output_tokens": 5000, "total_tokens": 5100},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


def test_overshoot_flagged_when_no_max_tokens(tmp_path):
    model = _BigOutputModel()  # no max_tokens field -> reserve uses the 1024 default, under-counts

    def call(state):
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["count"] >= 1 else "call", {"call": "call", END: END}
    )
    guarded = guard(graph.compile(), budget_usd=100.0, on_trip="kill", report_dir=tmp_path)
    guarded.invoke({"count": 0})

    run = next(iter(guarded._runs.values()))
    reconciles = [e for e in run.eventlog.events if e.type == "reconcile"]
    assert reconciles and any((e.detail or {}).get("overshoot") for e in reconciles)


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


# --- #82 semantic loop detection --------------------------------------------
def test_detect_loops_trips_before_budget(tmp_path):
    # build(20) calls the model 20× with identical input at the same node — a textbook runaway.
    guarded = guard(
        build(20), budget_usd=100.0, max_hops=100, on_trip="kill",
        detect_loops=True, report_dir=tmp_path,
    )
    with pytest.raises(BudgetKilled):
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    run = _only_run(guarded)
    assert run.tripwire.reason is TripReason.LOOP  # loop, not budget/hops
    assert run.tripwire.hops <= 5  # tripped early — nowhere near 20 loops or the $100 budget


def test_loops_run_to_completion_when_detection_off(tmp_path):
    # detect_loops defaults off → existing behaviour is unchanged (opt-in, non-breaking).
    guarded = guard(build(5), budget_usd=100.0, max_hops=100, on_trip="kill", report_dir=tmp_path)
    out = guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert out["count"] == 5


# --- #83 real-time spend counter --------------------------------------------
def test_live_callback_fires_per_hop_with_rising_spend(tmp_path):
    updates = []
    guarded = guard(
        build(3), budget_usd=100.0, max_hops=100, on_trip="kill",
        live=updates.append, report_dir=tmp_path,
    )
    guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert [u["hops"] for u in updates] == [1, 2, 3]  # one update per model hop
    assert all(u["budget_usd"] == 100.0 for u in updates)
    spents = [u["spent_usd"] for u in updates]
    assert spents == sorted(spents) and spents[0] > 0  # monotonically rising, real cost


def test_live_true_prints_spend_line_to_stderr(tmp_path, capsys):
    guarded = guard(build(2), budget_usd=5.0, on_trip="kill", live=True, report_dir=tmp_path)
    guarded.invoke({"count": 0}, {"recursion_limit": 100})
    err = capsys.readouterr().err
    assert "[breakerbox]" in err and "/ $5.00" in err


# --- #84 cross-subagent / depth budget tracking (anti-evasion) ---------------
def _nest(app, levels: int):
    """Wrap `app` as a subgraph node `levels` times → a model call at nesting depth levels+1."""
    for _ in range(levels):
        g = StateGraph(S)
        g.add_node("sub", app)
        g.add_edge(START, "sub")
        g.add_edge("sub", END)
        app = g.compile()
    return app


def test_call_depth_counts_subgraph_nesting():
    from breakerbox.guard import _call_depth

    assert _call_depth(None) == 1
    assert _call_depth({}) == 1
    assert _call_depth({"langgraph_checkpoint_ns": "call:abc"}) == 1
    assert _call_depth({"langgraph_checkpoint_ns": "a:1|b:2|call:3"}) == 3


def test_subagent_spend_is_metered_and_summed(tmp_path):
    # a subgraph's 3 model calls all count toward the shared ledger — nesting doesn't hide spend.
    guarded = guard(_nest(build(3), 1), budget_usd=100.0, on_trip="kill", report_dir=tmp_path)
    guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert _only_run(guarded).ledger.total_spent() == 3 * COST_PER_CALL


def test_max_depth_trips_on_deep_nesting(tmp_path):
    # the model call runs at nesting depth 3; max_depth=2 trips it before the hop.
    guarded = guard(
        _nest(build(1), 2), budget_usd=100.0, max_hops=100, on_trip="kill",
        max_depth=2, report_dir=tmp_path,
    )
    with pytest.raises(BudgetKilled) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert exc.value.reason == "depth"


def test_deep_nesting_runs_without_max_depth(tmp_path):
    # max_depth defaults off → nesting is allowed (opt-in, non-breaking).
    out = guard(_nest(build(1), 2), budget_usd=100.0, on_trip="kill", report_dir=tmp_path).invoke(
        {"count": 0}, {"recursion_limit": 100}
    )
    assert out["count"] == 1


# --- #90 warn-before-kill alert rail ----------------------------------------
def test_parse_alerts_config():
    from breakerbox.guard import _DEFAULT_ALERT_THRESHOLDS, _parse_alerts

    assert _parse_alerts(False) == ([], None)
    assert _parse_alerts(None) == ([], None)
    thr, fn = _parse_alerts(True)
    assert thr == list(_DEFAULT_ALERT_THRESHOLDS) and fn is None

    def cb(_):
        return None

    assert _parse_alerts(cb) == (list(_DEFAULT_ALERT_THRESHOLDS), cb)
    thr, fn = _parse_alerts({"thresholds": [0.9, 0.5], "on_alert": cb})
    assert thr == [0.5, 0.9] and fn is cb  # sorted
    with pytest.raises(ValueError):
        _parse_alerts({"thresholds": [1.5]})


def test_alert_callback_fires_once_per_threshold_with_rising_spend(tmp_path):
    fired = []
    # big budget so the run completes; low thresholds so actual spend crosses them.
    guarded = guard(
        build(10), budget_usd=1.0, on_trip="kill", report_dir=tmp_path,
        alerts={"thresholds": [0.0005, 0.001, 0.005], "on_alert": fired.append},
    )
    guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert sorted(a["threshold"] for a in fired) == [0.0005, 0.001, 0.005]  # each once
    assert all(a["budget_usd"] == 1.0 and a["spent_usd"] > 0 for a in fired)


def test_alerts_default_logs_to_stderr(tmp_path, capsys):
    guarded = guard(
        build(5), budget_usd=1.0, on_trip="kill", report_dir=tmp_path,
        alerts={"thresholds": [0.001]},  # no on_alert → logs to stderr
    )
    guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert "% of budget spent" in capsys.readouterr().err


# --- #150 degradation ladder + explainable trips ----------------------------
def test_ladder_graceful_stop_returns_partial_results(tmp_path):
    from breakerbox.guard import GracefulStop
    from breakerbox.ladder import Ladder, LadderAction
    from breakerbox.meter import DEFAULT_MAX_OUTPUT_TOKENS

    est = cost_microusd(MODEL, 100, DEFAULT_MAX_OUTPUT_TOKENS)  # per-call reserve estimate
    budget_usd = (est + COST_PER_CALL // 2) / 1_000_000  # one call fits; the second trips budget
    guarded = guard(
        build(5, MemorySaver()), budget_usd=budget_usd, report_dir=tmp_path,
        ladder=Ladder.default(),
    )
    result = guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert isinstance(result, GracefulStop)  # returned, not raised — degrade before you die
    assert result.decision.action is LadderAction.GRACEFUL_STOP
    assert result.decision.reason is TripReason.BUDGET
    assert result.partial is not None and result.partial["count"] == 1  # partial progress kept
    d = result.decision.to_dict()  # explainable object is stable + complete
    assert d["policy"] == "ladder:graceful_stop@1.00" and d["reason"] == "budget"
    run = _only_run(guarded)
    assert any(e.type == "graceful_stop" for e in run.eventlog.events)


def test_no_ladder_keeps_binary_kill_and_carries_decision(tmp_path):
    # ladder defaults off → existing binary kill is unchanged (opt-in, non-breaking).
    guarded = guard(build(50), budget_usd=0.0001, on_trip="kill", report_dir=tmp_path)
    with pytest.raises(BudgetKilled) as exc:
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    assert exc.value.reason == "budget"
    # the explainable object rides along even without a ladder; no ladder => no degrade action
    assert exc.value.decision is not None
    assert exc.value.decision.reason is TripReason.BUDGET
    assert exc.value.decision.action is None
