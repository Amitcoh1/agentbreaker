"""#150 — the ladder middleware example degrades (model-swap → narrow) then graceful-stops.

Skipped unless langchain 1.x is installed, so the 0.3 suite is unaffected; it runs in the
`test-langchain1` CI leg. Uses the example's offline fake models — no API key.
"""

import sys
from pathlib import Path

import pytest

pytest.importorskip("langchain.agents.middleware")  # langchain 1.x

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "examples" / "ladder_middleware"))
import ladder_middleware as demo  # noqa: E402


def test_ladder_policy_selfcheck():
    demo._selfcheck()  # pure rung/narrow/decision policy, no agent


def test_run_swaps_model_then_graceful_stops():
    _, decision, labels = demo.run_demo()
    # the run climbed the ladder: it started on the primary model and swapped to the cheaper one
    assert labels[0] == "primary"
    assert "cheap" in labels, f"model never swapped: {labels}"
    # once swapped, it stays swapped (no flapping back to primary)
    first_cheap = labels.index("cheap")
    assert all(x == "cheap" for x in labels[first_cheap:]), labels
    # it ended in an explainable graceful stop, not a bare kill or a runaway
    assert decision is not None
    assert decision["reason"] == "budget"
    assert decision["action"] == "graceful_stop"
    assert decision["policy"] == "ladder:graceful_stop@1.00"
    assert len(labels) < 40  # tripped well before the recursion limit
