import ast
import json
from pathlib import Path

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from agentbreaker import BudgetKilled, codegen, graphspec

FX = Path(__file__).parent / "fixtures" / "graphspec"


def _spec(name):
    return json.loads((FX / f"{name}.json").read_text())


# --- behavioral asserts (independent of the golden files) -------------------
def test_output_parses_and_wires_guard():
    code = codegen.generate(_spec("linear"))
    ast.parse(code)  # valid Python
    assert "from agentbreaker import guard" in code
    assert "builder.compile(checkpointer=MemorySaver())" in code
    assert 'on_trip="pause"' in code


def test_sub_budgets_match_spec_exactly():
    spec = _spec("linear")
    code = codegen.generate(spec)
    expected = {
        n["id"]: n["sub_budget_usd"]
        for n in spec["nodes"]
        if n.get("type") == "model" and "sub_budget_usd" in n
    }
    line = next(ln for ln in code.splitlines() if "sub_budgets=" in ln)
    got = eval(line.strip().removeprefix("sub_budgets=").rstrip(","))  # noqa: S307
    assert got == expected


def test_router_becomes_conditional_edges_with_side_effect_comments():
    code = codegen.generate(_spec("router_cycle"))
    assert 'add_conditional_edges("router", router_route' in code
    assert '"pass": "publish"' in code and '"retry": "planner"' in code
    assert "side_effecting=True" in code  # the post_to_cms tool is flagged


# --- golden fixtures: the contract the Phase D TS mirror must match ----------
@pytest.mark.parametrize("name", ["linear", "router_cycle"])
def test_codegen_matches_golden(name):
    assert codegen.generate(_spec(name)) == (FX / f"{name}.py").read_text()


def test_validator_messages_match_golden():
    errors = graphspec.validate(_spec("over_allocation")).errors
    assert errors == json.loads((FX / "over_allocation.errors.json").read_text())


# --- round-trip identity ----------------------------------------------------
def test_spec_json_round_trip():
    spec = graphspec.example_spec()
    assert graphspec.from_json(graphspec.to_json(spec)) == spec


# --- integration: the generated graph actually ENFORCES the budget ----------
class _CostlyModel(BaseChatModel):
    model: str = "openai/gpt-4o"

    @property
    def _llm_type(self):
        return "costly"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # reports a huge output so the first hop's real cost (~$2) blows a $0.50 budget
        msg = AIMessage(
            content="x",
            usage_metadata={"input_tokens": 100, "output_tokens": 200000, "total_tokens": 200100},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


def test_generated_graph_enforces_the_budget():
    # two model nodes in series + a $0.50 budget: the first call meters ~$2, so the
    # SECOND node's gate trips -> BudgetKilled raised out of invoke. "Runs" != "enforces".
    spec = {
        "version": "1",
        "config": {"budget_usd": 0.5, "max_hops": 100, "on_trip": "kill"},
        "nodes": [
            {"id": "start", "type": "start"},
            {"id": "m1", "type": "model", "model": "openai/gpt-4o"},
            {"id": "m2", "type": "model", "model": "openai/gpt-4o"},
            {"id": "end", "type": "end"},
        ],
        "edges": [
            {"source": "start", "target": "m1"},
            {"source": "m1", "target": "m2"},
            {"source": "m2", "target": "end"},
        ],
    }
    code = codegen.generate(spec).replace(
        "    # TODO: call your model here and update state",
        "    model.invoke([HumanMessage(content='hi')])",
    )
    ns = {"model": _CostlyModel(), "HumanMessage": HumanMessage}
    exec(compile(code, "<generated>", "exec"), ns)  # noqa: S102
    with pytest.raises(BudgetKilled):
        ns["app"].invoke({})
