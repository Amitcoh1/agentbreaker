"""#148 — the deepagents demo trips a real modern agent and surfaces the explainable decision.

Skipped unless langchain 1.x + deepagents are installed, so the 0.3 suite is unaffected; it runs
in the `test-langchain1` CI leg.
"""

import sys
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage

pytest.importorskip("langchain.agents.middleware")  # langchain 1.x
pytest.importorskip("deepagents")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "examples" / "deepagents_demo"))
import demo  # noqa: E402


def test_deepagents_runaway_trips_with_explainable_decision():
    messages, decision = demo.run_demo()
    trips = [m for m in messages if isinstance(m, AIMessage) and "breakerbox" in (m.content or "")]
    assert trips  # the runaway deep agent was stopped
    assert decision is not None  # a real explainable object, not a bare boolean
    assert decision["reason"] == "budget"
    assert decision["action"] == "graceful_stop"  # degraded, didn't just die
    hops = sum(1 for m in messages if isinstance(m, AIMessage) and m.tool_calls)
    assert hops < 40  # tripped early — nowhere near the recursion limit
