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


# --- #150 degradation ladder on the 1.x middleware --------------------------
from breakerbox.ladder import Ladder, LadderAction, Rung  # noqa: E402

CHEAPER = "openai/gpt-4o-mini"


class _NamedModel(BaseChatModel):
    """A looping fake model that stamps a configurable model_name on each reply."""

    tag: str = MODEL

    @property
    def _llm_type(self) -> str:
        return "named-fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = sum(1 for m in messages if isinstance(m, AIMessage))
        msg = AIMessage(
            content="working...",
            tool_calls=[{"name": "noop", "args": {}, "id": f"c{n}"}],
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
            response_metadata={"model_name": self.tag},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def bind_tools(self, tools, **kwargs):
        return self


def test_ladder_swaps_to_cheaper_model_past_threshold():
    # real model_swap: past 80% of budget wrap_model_call rewrites request.model to the cheaper one.
    cheaper = _NamedModel(tag=CHEAPER)
    ladder = Ladder(rungs=(Rung(0.80, (LadderAction.MODEL_SWAP,), swap_model=CHEAPER),))
    # max_hops stops the run cleanly a couple hops after the swap (cheaper calls barely add spend).
    agent = create_agent(
        model=_NamedModel(tag=MODEL),
        tools=[noop],
        middleware=[BreakerboxMiddleware(budget_usd=0.006, max_hops=9, model=MODEL, ladder=ladder,
                                         swap_model=cheaper)],
    )
    result = agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 40})
    names = [
        m.response_metadata.get("model_name")
        for m in result["messages"]
        if isinstance(m, AIMessage) and (m.response_metadata or {}).get("model_name")
    ]
    assert names[0] == MODEL  # started on the expensive model
    assert CHEAPER in names  # degraded to the cheaper model in-run
    assert names.index(MODEL) < names.index(CHEAPER)  # expensive first, then the swap


class _T:
    def __init__(self, name: str) -> None:
        self.name = name


class _FakeReq:
    """Minimal stand-in for a 1.x ModelRequest with the immutable .override() contract."""

    def __init__(self, state, tools, model):
        self.state, self.tools, self.model = state, tools, model

    def override(self, **kw):
        return _FakeReq(self.state, kw.get("tools", self.tools), kw.get("model", self.model))


def test_degrade_narrows_tools_and_skips_swap_without_instance():
    lad = Ladder(
        rungs=(
            Rung(
                0.80,
                (LadderAction.MODEL_SWAP, LadderAction.TOOL_NARROW),
                swap_model=CHEAPER,
                keep_tools=("safe",),
            ),
        )
    )
    mw = BreakerboxMiddleware(budget_usd=1.0, ladder=lad, swap_model=None)  # no cheaper instance
    tools = [_T("safe"), _T("risky")]
    below = _FakeReq({"bbx_spent_micro": 100_000}, tools, "orig")  # 10% of $1 -> no rung
    assert mw._degrade(below) is below
    above = _FakeReq({"bbx_spent_micro": 900_000}, tools, "orig")  # 90% -> rung active
    out = mw._degrade(above)
    assert [t.name for t in out.tools] == ["safe"]  # narrowed to the allow-list
    assert out.model == "orig"  # swap skipped — no swap_model instance was provided


def test_graceful_stop_notice_carries_explainable_decision():
    ladder = Ladder(rungs=(Rung(1.00, (LadderAction.GRACEFUL_STOP,)),))
    agent = _agent(True, budget_usd=round(3 * COST / 1e6, 6), model=MODEL, ladder=ladder)
    result = agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 50})
    notices = [
        m for m in result["messages"]
        if isinstance(m, AIMessage) and "graceful stop" in (m.content or "")
    ]
    assert notices  # degraded to a graceful stop, not a bare trip
    d = notices[-1].additional_kwargs["breakerbox"]  # the explainable object rides on the message
    assert d["action"] == "graceful_stop" and d["reason"] == "budget"
    assert d["policy"] == "ladder:graceful_stop@1.00"


class _BoundedModel(BaseChatModel):
    """Loops (tool-calls) for stop_after hops, then answers — so a shadow run ends on its own."""

    stop_after: int = 6

    @property
    def _llm_type(self) -> str:
        return "bounded-fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        n = sum(1 for m in messages if isinstance(m, AIMessage))
        return ChatResult(generations=[ChatGeneration(message=_msg(n < self.stop_after, n))])

    def bind_tools(self, tools, **kwargs):
        return self


def test_shadow_records_would_trip_and_never_blocks():
    seen = []
    agent = create_agent(
        model=_BoundedModel(stop_after=6),
        tools=[noop],
        middleware=[BreakerboxMiddleware(budget_usd=round(3 * COST / 1e6, 6), model=MODEL,
                                         shadow=True, on_would_trip=seen.append)],
    )
    result = agent.invoke({"messages": [HumanMessage("go")]}, {"recursion_limit": 40})
    assert not _trips(result["messages"])  # shadow never blocks the run
    assert any(w["reason"] == "budget" and w["shadow"] for w in seen)  # but records the would-trip
    calls = sum(1 for m in result["messages"] if isinstance(m, AIMessage) and m.tool_calls)
    assert calls > 3  # ran past the 3-call budget that enforce mode would have stopped at
