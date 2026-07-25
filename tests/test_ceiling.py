"""Tests for the provable cost ceiling (#79) — mirrors cloud/dashboard/lib/costCeiling.test.ts."""

from breakerbox import ceiling

M = "openai/gpt-4o"  # priced in the bundled table


def _spec(nodes, edges, config=None):
    cfg = config or {"budget_usd": 5, "max_hops": 20}
    return {"version": "1", "config": cfg, "nodes": nodes, "edges": edges}


def _model(nid, max_tokens=1024):
    return {"id": nid, "type": "model", "model": M, "max_tokens": max_tokens}


def test_no_start_has_no_bound():
    c = ceiling.cost_ceiling(_spec([_model("a")], []))
    assert c.ceiling_usd is None and c.bounded is False


def test_acyclic_is_sum_of_reachable_worst_cases():
    c = ceiling.cost_ceiling(
        _spec(
            [{"id": "s", "type": "start"}, _model("a"), _model("b"), {"id": "e", "type": "end"}],
            [
                {"source": "s", "target": "a"},
                {"source": "a", "target": "b"},
                {"source": "b", "target": "e"},
            ],
        )
    )
    assert c.basis == "dag-sum" and c.bounded
    assert abs(c.ceiling_usd - c.costliest_hop_usd * 2) < 1e-9  # two equal hops summed


def test_unreachable_excluded():
    c = ceiling.cost_ceiling(
        _spec(
            [
                {"id": "s", "type": "start"},
                _model("a"),
                _model("orphan"),
                {"id": "e", "type": "end"},
            ],
            [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],  # orphan unreachable
        )
    )
    assert abs(c.ceiling_usd - c.costliest_hop_usd) < 1e-9  # only "a", not "orphan"


def _loop_spec(config):
    return _spec(
        [
            {"id": "s", "type": "start"},
            _model("a"),
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


def test_looped_is_max_hops_times_costliest():
    c = ceiling.cost_ceiling(_loop_spec({"budget_usd": 1000, "max_hops": 10}))
    assert c.basis == "hops-cap" and c.bounded
    assert abs(c.ceiling_usd - c.costliest_hop_usd * 10) < 1e-9


def test_looped_without_max_hops_is_unbounded():
    c = ceiling.cost_ceiling(_loop_spec({"budget_usd": 5}))
    assert c.ceiling_usd is None and c.bounded is False


def test_budget_binds_when_budget_below_ceiling():
    c = ceiling.cost_ceiling(_loop_spec({"budget_usd": 0.01, "max_hops": 100}))
    assert c.budget_binds is True


def test_unpriced_model_is_listed():
    c = ceiling.cost_ceiling(
        _spec(
            [
                {"id": "s", "type": "start"},
                {"id": "a", "type": "model", "model": "made-up/not-in-table", "max_tokens": 1024},
                {"id": "e", "type": "end"},
            ],
            [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],
        )
    )
    assert "a" in c.unpriced_models


def test_format_is_human_readable():
    bounded = ceiling.cost_ceiling(_loop_spec({"budget_usd": 1000, "max_hops": 10}))
    out = ceiling.format_ceiling(bounded)
    assert "Worst-case ceiling" in out and "hops" in out
    unbounded = ceiling.format_ceiling(ceiling.cost_ceiling(_loop_spec({"budget_usd": 5})))
    assert "UNBOUNDED" in unbounded
