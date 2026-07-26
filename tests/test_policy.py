"""Tests for #86 policy-as-code — breakerbox.yaml enforced at build time (compile-time refusal)."""

import json

from breakerbox import policy
from breakerbox.cli import main

M = "openai/gpt-4o"


def _spec(config=None, nodes=None, edges=None):
    return {
        "version": "1",
        "config": config or {"budget_usd": 5, "max_hops": 20},
        "nodes": nodes
        or [
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": M, "max_tokens": 1024},
            {"id": "e", "type": "end"},
        ],
        "edges": edges or [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],
    }


def _rules(vs):
    return {v.rule for v in vs}


def test_compliant_spec_has_no_violations():
    pol = {"max_ceiling_usd": 100, "max_hops": 50, "require_bounded": True}
    assert policy.check_policy(_spec(), pol) == []


def test_max_ceiling_and_node_cost_violations():
    assert "max_ceiling_usd" in _rules(policy.check_policy(_spec(), {"max_ceiling_usd": 0.001}))
    assert "max_node_cost_usd" in _rules(policy.check_policy(_spec(), {"max_node_cost_usd": 0.001}))


def test_max_hops_violation_and_missing():
    assert "max_hops" in _rules(policy.check_policy(_spec({"max_hops": 50}), {"max_hops": 20}))
    assert "max_hops" in _rules(policy.check_policy(_spec({"budget_usd": 5}), {"max_hops": 20}))


def test_require_bounded_violation_on_unbounded_loop():
    loop = _spec(
        config={"budget_usd": 5},
        nodes=[
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": M, "max_tokens": 1024},
            {"id": "r", "type": "router", "condition": "again"},
            {"id": "e", "type": "end"},
        ],
        edges=[
            {"source": "s", "target": "a"},
            {"source": "a", "target": "r"},
            {"source": "r", "target": "a", "condition": "loop"},
            {"source": "r", "target": "e", "condition": "done"},
        ],
    )
    assert "require_bounded" in _rules(policy.check_policy(loop, {"require_bounded": True}))


def test_banned_model_violation():
    assert "banned_models" in _rules(policy.check_policy(_spec(), {"banned_models": [M]}))


def test_allow_destructive_false_violation():
    nodes = [
        {"id": "s", "type": "start"},
        {"id": "d", "type": "tool", "name": "delete", "side_effect_class": "destructive"},
        {"id": "e", "type": "end"},
    ]
    edges = [{"source": "s", "target": "d"}, {"source": "d", "target": "e"}]
    vs = policy.check_policy(_spec(nodes=nodes, edges=edges), {"allow_destructive": False})
    assert "allow_destructive" in _rules(vs)


def test_load_policy_yaml(tmp_path):
    p = tmp_path / "breakerbox.yaml"
    p.write_text("max_ceiling_usd: 5.0\nmax_hops: 20\n")
    assert policy.load_policy(p) == {"max_ceiling_usd": 5.0, "max_hops": 20}


def test_cli_policy_check_and_build_refusal(tmp_path):
    spec_p = tmp_path / "g.spec.json"
    spec_p.write_text(json.dumps(_spec()))
    pol_p = tmp_path / "breakerbox.yaml"
    pol_p.write_text("max_ceiling_usd: 0.001\n")  # ceiling ~$0.0465 > 0.001 → violation
    assert main(["policy", str(spec_p), "-p", str(pol_p)]) == 1
    assert main(["build", str(spec_p), "-p", str(pol_p)]) == 1  # refuses to emit
    assert main(["build", str(spec_p), "-p", str(pol_p), "--no-policy"]) == 0  # bypass


def test_runtime_policy_templates():
    # #74: named guard() presets for a safety posture.
    assert policy.template("permissive") == {"on_trip": "pause"}
    locked = policy.template("locked")
    assert locked["on_trip"] == "kill" and locked["detect_loops"] and locked["max_depth"] == 4
    assert policy.template("standard")["detect_loops"] is True


def test_template_returns_fresh_dict_and_rejects_unknown():
    import pytest

    policy.template("locked")["on_trip"] = "pause"  # mutate the copy
    assert policy.template("locked")["on_trip"] == "kill"  # original unaffected
    with pytest.raises(ValueError):
        policy.template("bogus")


def test_template_keys_are_valid_guard_kwargs():
    import inspect

    from breakerbox import guard

    valid = set(inspect.signature(guard).parameters)
    for name in ("permissive", "standard", "locked"):
        assert set(policy.template(name)) <= valid  # every preset key is a real guard() param
