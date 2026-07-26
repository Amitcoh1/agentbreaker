"""guard(otel=True) emits GenAI-semantic-convention spans to the configured OTel provider."""

from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from breakerbox import BudgetKilled, guard, mark_side_effecting

MODEL = "openai/gpt-4o"


class FakeUsageChatModel(BaseChatModel):
    model: str = MODEL

    @property
    def _llm_type(self) -> str:
        return "fake-usage"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    count: int


def _build(loops: int):
    model = FakeUsageChatModel()

    def call(state):
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    g = StateGraph(S)
    g.add_node("call", call)
    g.add_edge(START, "call")
    g.add_conditional_edges(
        "call", lambda s: END if s["count"] >= loops else "call", {"call": "call", END: END}
    )
    return g.compile()


@pytest.fixture
def spans():
    """A fresh in-memory exporter wired as the active tracer provider for the test."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    saved = trace._TRACER_PROVIDER  # set directly — set_tracer_provider() is a once-only guard
    trace._TRACER_PROVIDER = provider
    try:
        yield exporter
    finally:
        trace._TRACER_PROVIDER = saved


def _by_name(finished):
    out: dict[str, list] = {}
    for s in finished:
        out.setdefault(s.name, []).append(s)
    return out


def test_no_spans_without_otel(spans, tmp_path):
    guarded = guard(_build(2), budget_usd=100.0, on_trip="kill", report_dir=tmp_path)
    guarded.invoke({"count": 0})
    names = {s.name for s in spans.get_finished_spans()}
    assert "breakerbox.run" not in names  # otel defaults off — nothing emitted


def test_run_and_per_hop_spans(spans, tmp_path):
    guarded = guard(_build(3), budget_usd=100.0, on_trip="kill", report_dir=tmp_path, otel=True)
    guarded.invoke({"count": 0})
    named = _by_name(spans.get_finished_spans())

    assert len(named["breakerbox.run"]) == 1
    hops = named["chat gpt-4o"]
    assert len(hops) == 3  # one span per model hop

    a = dict(hops[0].attributes)
    assert a["gen_ai.operation.name"] == "chat"
    assert a["gen_ai.system"] == "openai"
    assert a["gen_ai.request.model"] == "gpt-4o"
    assert a["gen_ai.usage.input_tokens"] == 100
    assert a["gen_ai.usage.output_tokens"] == 50
    assert a["breakerbox.cost_usd"] > 0
    assert a["breakerbox.node"] == "call"

    run_span = named["breakerbox.run"][0]
    run_attrs = dict(run_span.attributes)
    assert run_attrs["breakerbox.budget_usd"] == 100.0
    assert run_attrs["breakerbox.spent_usd"] > 0
    # hop spans are children of the run span
    assert hops[0].parent.span_id == run_span.context.span_id


def test_tool_span(spans, tmp_path):
    @tool
    def send_email(to: str) -> str:
        """Send an email."""
        return "sent"

    mark_side_effecting(send_email)
    model = FakeUsageChatModel()

    def call(state):
        send_email.invoke({"to": "x"})
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    g = StateGraph(S)
    g.add_node("call", call)
    g.add_edge(START, "call")
    g.add_conditional_edges(
        "call", lambda s: END if s["count"] >= 1 else "call", {"call": "call", END: END}
    )
    guarded = guard(g.compile(), budget_usd=100.0, on_trip="kill", report_dir=tmp_path, otel=True)
    guarded.invoke({"count": 0})

    tool_spans = _by_name(spans.get_finished_spans())["execute_tool send_email"]
    assert len(tool_spans) == 1
    a = dict(tool_spans[0].attributes)
    assert a["gen_ai.operation.name"] == "execute_tool"
    assert a["gen_ai.tool.name"] == "send_email"
    assert a["breakerbox.side_effecting"] is True


def test_trip_reason_on_run_span(spans, tmp_path):
    guarded = guard(
        _build(50), budget_usd=100.0, max_hops=2, on_trip="kill", report_dir=tmp_path, otel=True
    )
    with pytest.raises(BudgetKilled):
        guarded.invoke({"count": 0}, {"recursion_limit": 100})
    run_span = _by_name(spans.get_finished_spans())["breakerbox.run"][0]
    assert dict(run_span.attributes)["breakerbox.trip_reason"] == "hops"
