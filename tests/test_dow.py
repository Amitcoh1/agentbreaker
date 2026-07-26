"""Tests for denial-of-wallet assessment (#130) — reuses the ceiling test's spec shapes."""

import json

from breakerbox import dow
from breakerbox.cli import main

M = "openai/gpt-4o"  # priced in the bundled table


def _spec(nodes, edges, config=None):
    return {"version": "1", "config": config or {"budget_usd": 5, "max_hops": 20}, "nodes": nodes,
            "edges": edges}


def _loop_spec(config):
    # start -> a(model) -> r(router); r loops back to a or exits to e. A cycle a<->r.
    return _spec(
        [
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": M, "max_tokens": 1024},
            {"id": "r", "type": "router", "condition": "again"},
            {"id": "e", "type": "end"},
        ],
        [
            {"source": "s", "target": "a"},
            {"source": "a", "target": "r"},
            {"source": "r", "target": "a", "condition": "loop"},
            {"source": "r", "target": "e", "condition": "done"},
        ],
        config,
    )


def _linear_spec():
    return _spec(
        [{"id": "s", "type": "start"}, {"id": "a", "type": "model", "model": M, "max_tokens": 1024},
         {"id": "e", "type": "end"}],
        [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],
    )


def test_unbounded_loop_without_budget_is_critical():
    f = dow.assess_dow(_loop_spec({"max_hops": None}))  # no budget, no max_hops
    assert f.severity == "critical"
    assert f.unbounded is True
    assert f.worst_case_usd is None  # truly unbounded — nothing caps it
    assert set(f.loop_nodes) == {"a", "r"}  # the attack surface is named


def test_unbounded_loop_with_budget_is_high_capped_at_budget():
    f = dow.assess_dow(_loop_spec({"budget_usd": 5}))  # budget, but no max_hops
    assert f.severity == "high"
    assert f.unbounded is True
    assert f.worst_case_usd == 5  # the budget is the per-invocation loss
    assert set(f.loop_nodes) == {"a", "r"}


def test_bounded_loop_is_clean():
    f = dow.assess_dow(_loop_spec({"budget_usd": 1000, "max_hops": 10}))
    assert f.severity == "none"
    assert f.unbounded is False
    assert f.loop_nodes == []


def test_linear_graph_is_clean():
    f = dow.assess_dow(_linear_spec())
    assert f.severity == "none" and f.unbounded is False


def test_format_names_the_loop_and_loss():
    out = dow.format_dow(dow.assess_dow(_loop_spec({"budget_usd": 5})))
    assert "HIGH" in out and "Attack surface" in out and "$5" in out


def test_cli_strict_fails_on_finding(tmp_path, capsys):
    spec = tmp_path / "vuln.json"
    spec.write_text(json.dumps(_loop_spec({"budget_usd": 5})))
    assert main(["dow", str(spec), "--strict"]) == 1  # a finding -> non-zero for CI
    assert main(["dow", str(spec)]) == 0  # without --strict, informative only
    out = capsys.readouterr().out
    assert "Denial-of-wallet" in out


def test_cli_strict_passes_when_bounded(tmp_path, capsys):
    spec = tmp_path / "safe.json"
    spec.write_text(json.dumps(_loop_spec({"budget_usd": 1000, "max_hops": 10})))
    assert main(["dow", str(spec), "--strict"]) == 0


def test_cli_json_is_machine_readable(tmp_path, capsys):
    spec = tmp_path / "vuln.json"
    spec.write_text(json.dumps(_loop_spec({"max_hops": None})))
    assert main(["dow", str(spec), "--json"]) == 0
    row = json.loads(capsys.readouterr().out.strip())
    assert row["rule"] == "denial-of-wallet" and row["severity"] == "critical"
    assert row["spec"] == str(spec) and row["worst_case_usd"] is None
