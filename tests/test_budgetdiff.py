"""Tests for #80 Budget Diff — ceiling delta between two files (spec.json or generated .py).

The generated .py fixtures carry a baked ceiling header (from #79), so they double as diff inputs
with known values: with_code $0.0260, router_cycle $1.69, unbounded_loop UNBOUNDED, linear $0.0465.
"""

from pathlib import Path

from breakerbox import budgetdiff
from breakerbox.cli import main

FX = Path(__file__).parent / "fixtures" / "graphspec"


def test_ceiling_of_parses_generated_py():
    assert budgetdiff.ceiling_of(str(FX / "router_cycle.py")) == (1.69, "bounded")


def test_ceiling_of_parses_unbounded_py():
    assert budgetdiff.ceiling_of(str(FX / "unbounded_loop.py")) == (None, "unbounded")


def test_ceiling_of_recomputes_json_spec():
    usd, kind = budgetdiff.ceiling_of(str(FX / "router_cycle.json"))
    assert kind == "bounded" and abs(usd - 1.686) < 1e-6


def test_diff_reports_increase_with_delta():
    msg, increased = budgetdiff.diff_ceiling(str(FX / "with_code.py"), str(FX / "router_cycle.py"))
    assert increased
    assert "$0.0260" in msg and "$1.69" in msg and "+$1.66" in msg


def test_diff_bounded_to_unbounded_is_regression():
    msg, increased = budgetdiff.diff_ceiling(str(FX / "linear.py"), str(FX / "unbounded_loop.py"))
    assert increased and "UNBOUNDED" in msg and "regression" in msg


def test_diff_unbounded_to_bounded_is_not_increase():
    msg, increased = budgetdiff.diff_ceiling(str(FX / "unbounded_loop.py"), str(FX / "linear.py"))
    assert not increased and "now bounded" in msg


def test_diff_decrease_is_not_increase():
    _, increased = budgetdiff.diff_ceiling(str(FX / "router_cycle.py"), str(FX / "with_code.py"))
    assert not increased


def test_cli_fail_on_increase_exits_1():
    rc = main(["diff", str(FX / "with_code.py"), str(FX / "router_cycle.py"), "--fail-on-increase"])
    assert rc == 1


def test_cli_reports_without_flag_exits_0(capsys):
    rc = main(["diff", str(FX / "with_code.py"), str(FX / "router_cycle.py")])
    assert rc == 0 and "Cost ceiling:" in capsys.readouterr().out
