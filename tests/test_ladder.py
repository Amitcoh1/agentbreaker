"""#150 — pure-core degradation ladder + explainable trip decisions."""

import json

import pytest

from breakerbox.ladder import (
    Ladder,
    LadderAction,
    Rung,
    TripDecision,
    budget_decision,
)
from breakerbox.tripwire import TripReason


def test_default_ladder_rung_selection():
    lad = Ladder.default(swap_model="openai/gpt-4o-mini")
    assert lad.rung_for(0.50) is None  # below the first rung
    assert lad.rung_for(0.79) is None
    r80 = lad.rung_for(0.80)  # exactly on the model-swap rung
    assert r80 is not None
    assert r80.has(LadderAction.MODEL_SWAP) and r80.has(LadderAction.TOOL_NARROW)
    assert r80.swap_model == "openai/gpt-4o-mini"
    assert lad.rung_for(0.95) is r80  # still the 80% rung, not yet stopping
    r100 = lad.rung_for(1.00)
    assert r100 is not None and r100.has(LadderAction.GRACEFUL_STOP) and r100.stops_run
    assert lad.rung_for(1.30) is r100  # overspend stays at the terminal rung


def test_rungs_are_sorted_and_indexed():
    lad = Ladder(
        rungs=(
            Rung(1.00, (LadderAction.GRACEFUL_STOP,)),
            Rung(0.80, (LadderAction.TOOL_NARROW,)),  # given out of order
        )
    )
    assert [r.threshold for r in lad.rungs] == [0.80, 1.00]
    assert lad.index_of(lad.rung_for(0.80)) == 0
    assert lad.index_of(lad.rung_for(1.00)) == 1
    assert lad.index_of(None) is None


def test_model_swap_rung_requires_swap_model():
    # error path: MODEL_SWAP with no cheaper model is a configuration bug, caught at build time.
    with pytest.raises(ValueError, match="swap_model"):
        Rung(0.80, (LadderAction.MODEL_SWAP,))


def test_empty_rung_and_empty_ladder_rejected():
    with pytest.raises(ValueError, match="at least one action"):
        Rung(0.80, ())
    with pytest.raises(ValueError, match="at least one rung"):
        Ladder(rungs=())
    with pytest.raises(ValueError, match=">= 0"):
        Rung(-0.1, (LadderAction.KILL,))


def test_trip_decision_stable_json_has_all_fields():
    d = TripDecision(
        reason=TripReason.BUDGET,
        policy="ladder:graceful_stop@1.00",
        threshold=1.0,
        counter_value=1.03,
        ladder_rung=1,
        action=LadderAction.GRACEFUL_STOP,
        override_url="https://x/control/run1",
        spent_micro=1030,
        budget_micro=1000,
    )
    out = d.to_dict()
    # the explainable-object contract (VISION §6): these keys must always be present
    for k in ("policy", "threshold", "counter_value", "confidence", "ladder_rung", "reason",
              "override_url"):
        assert k in out
    assert out["reason"] == "budget" and out["action"] == "graceful_stop"
    # stable across calls + parseable
    assert d.to_json() == d.to_json()
    assert json.loads(d.to_json())["ladder_rung"] == 1


def test_budget_decision_picks_active_rung_and_action():
    lad = Ladder.default()
    # at 103% of budget the terminal graceful-stop rung is active
    d = budget_decision(TripReason.BUDGET, spent_micro=1030, budget_micro=1000, ladder=lad)
    assert d.action is LadderAction.GRACEFUL_STOP
    assert d.ladder_rung == 1
    assert d.counter_value == pytest.approx(1.03)
    assert d.policy == "ladder:graceful_stop@1.00"
    assert d.confidence == 1.0
    # no ladder -> a plain budget decision, no rung/action
    plain = budget_decision(TripReason.BUDGET, 1030, 1000)
    assert plain.action is None and plain.ladder_rung is None and plain.policy == "budget"


def test_loop_reason_lowers_confidence():
    d = budget_decision(TripReason.LOOP, 500, 1000)
    assert d.confidence == 0.9  # a heuristic detector is not a hard arithmetic limit
