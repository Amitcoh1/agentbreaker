"""guard() composes with a gateway (LiteLLM / Portkey).

Metering is a LangChain callback, not a network hook, so guard works behind any OpenAI-compatible
proxy with no extra wiring. A real proxy isn't needed to exercise the path — the fake model stands
in for a gateway-routed model (guard meters what the callback reports, independent of the base_url).
"""

from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import guard
from breakerbox.pricing import UnknownModelError, cost_microusd


class GatewayModel(BaseChatModel):
    """A model routed through a gateway: a base_url + a reported model name. guard never touches
    the base_url — it meters the model name the callback surfaces."""

    model: str = "openai/gpt-4o"
    base_url: str = "http://localhost:4000"  # e.g. a LiteLLM proxy

    @property
    def _llm_type(self) -> str:
        return "gateway-fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    count: int


def _build(model):
    def call(state):
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    g = StateGraph(S)
    g.add_node("call", call)
    g.add_edge(START, "call")
    g.add_edge("call", END)
    return g.compile()


def _spent(guarded):
    return next(iter(guarded._runs.values())).ledger.total_spent()


def test_gateway_routed_model_is_metered(tmp_path):
    guarded = guard(_build(GatewayModel()), budget_usd=100.0, on_trip="kill", report_dir=tmp_path)
    guarded.invoke({"count": 0})
    assert _spent(guarded) == cost_microusd("openai/gpt-4o", 100, 50)


def test_metering_independent_of_base_url(tmp_path):
    with_gw = guard(
        _build(GatewayModel(base_url="http://gw:4000")), budget_usd=100.0,
        on_trip="kill", report_dir=tmp_path,
    )
    with_gw.invoke({"count": 0})
    direct = guard(
        _build(GatewayModel(base_url="")), budget_usd=100.0, on_trip="kill", report_dir=tmp_path
    )
    direct.invoke({"count": 0})
    assert _spent(with_gw) == _spent(direct) == cost_microusd("openai/gpt-4o", 100, 50)


def test_unknown_gateway_deployment_fails_before_dispatch(tmp_path):
    # a bare deployment name the price table doesn't know -> guard raises BEFORE the call runs
    model = GatewayModel(model="litellm/my-custom-deploy")
    guarded = guard(
        _build(model), budget_usd=100.0, on_trip="kill", unknown_model="fail", report_dir=tmp_path
    )
    with pytest.raises(UnknownModelError):
        guarded.invoke({"count": 0})
