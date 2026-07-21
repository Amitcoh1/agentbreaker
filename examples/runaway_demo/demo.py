"""Breakerbox runaway demo: a context-accumulation loop, unguarded vs guarded.

No API keys needed. A fake model reports realistic, growing token usage so the
runaway is deterministic and offline. The SAME metering engine bills both runs, so
the comparison is apples to apples.

    python demo.py
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from agentbreaker import BudgetKilled, guard

MODEL = "openai/gpt-4o"
MAX_HOPS = 60  # the broken loop never self-terminates before this
MAX_OUTPUT_TOKENS = 2500
FILLER = "context " * MAX_OUTPUT_TOKENS  # ~2500 real tokens of reply, retained every hop
REPORTS = Path(__file__).parent / "reports"


class RunawayModel(BaseChatModel):
    """Emits a real ~max_tokens reply that gets retained, so the context (and cost)
    genuinely grows every hop. No usage_metadata -> honest local self-metering (F3),
    and because max_tokens is a real ceiling the reserve estimate is a true upper
    bound, so the guard blocks the crossing call *before* it runs.
    """

    model: str = MODEL
    max_tokens: int = MAX_OUTPUT_TOKENS

    @property
    def _llm_type(self) -> str:
        return "runaway"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=FILLER))])


class State(TypedDict):
    messages: list
    hop: int


def build_runaway():
    model = RunawayModel()

    def agent(state: State):
        # declare max_tokens so the reserve is a true upper bound (no late-cap overshoot)
        response = model.invoke(state["messages"], max_tokens=MAX_OUTPUT_TOKENS)
        # a broken retry loop that never drops context -> it accumulates forever
        grown = [*state["messages"], response, HumanMessage(content="that failed, try again")]
        return {"messages": grown, "hop": state["hop"] + 1}

    def keep_going(state: State):
        return END if state["hop"] >= MAX_HOPS else "agent"

    graph = StateGraph(State)
    graph.add_node("agent", agent)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", keep_going, {"agent": "agent", END: END})
    return graph.compile()


def _spent_usd(guarded) -> float:
    run = next(iter(guarded._runs.values()))
    return run.ledger.total_spent() / 1_000_000


def main() -> None:
    start = {"messages": [HumanMessage(content="Do the task.")], "hop": 0}
    cfg = {"recursion_limit": MAX_HOPS * 3}

    # 1) UNGUARDED: same metering, a ceiling so high it never trips -> the true cost.
    unguarded = guard(
        build_runaway(), budget_usd=10_000.0, max_hops=10_000, on_trip="kill", report_dir=REPORTS
    )
    unguarded.invoke(dict(start), cfg)
    runaway_cost = _spent_usd(unguarded)

    # 2) GUARDED: a real dollar ceiling.
    guarded = guard(build_runaway(), budget_usd=0.90, on_trip="kill", report_dir=REPORTS)
    stopped_cost, receipt = runaway_cost, None
    try:
        guarded.invoke(dict(start), cfg)
    except BudgetKilled as killed:
        stopped_cost, receipt = killed.spent_usd, killed.report_path

    print("\n" + "=" * 62)
    print(f"  UNGUARDED runaway : ran {MAX_HOPS} hops, spent ${runaway_cost:,.2f}")
    print(f"  GUARDED           : killed early, spent ${stopped_cost:,.2f}  (budget $0.90)")
    print(f"  AVERTED           : ${runaway_cost - stopped_cost:,.2f}")
    if receipt:
        print(f"  receipt (open it) : {receipt}")
    print("=" * 62)


if __name__ == "__main__":
    main()
