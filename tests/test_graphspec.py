from hypothesis import given
from hypothesis import strategies as st

from agentbreaker.graphspec import example_spec, validate

START = {"id": "start", "type": "start"}
END = {"id": "end", "type": "end"}


def _model(nid, sub=None, max_tokens=1024):
    n = {"id": nid, "type": "model", "model": "openai/gpt-4o", "max_tokens": max_tokens}
    if sub is not None:
        n["sub_budget_usd"] = sub
    return n


def _edge(s, t, cond=None):
    e = {"source": s, "target": t}
    if cond is not None:
        e["condition"] = cond
    return e


def _spec(nodes, edges, **config):
    cfg = {"budget_usd": 5.0, "on_trip": "pause"}
    cfg.update(config)
    return {"version": "1", "config": cfg, "nodes": nodes, "edges": edges}


# --- the bundled example is the golden valid case (with a cycle) -------------
def test_example_is_valid_and_has_a_cycle_note():
    r = validate(example_spec())
    assert r.ok
    assert not r.errors
    assert not r.warnings  # both model nodes declare max_tokens
    assert any("Cycle detected" in n for n in r.notes)


# --- the signature rule: Σ sub_budget ≤ budget ------------------------------
def test_budget_over_allocation_errors():
    r = validate(_spec([START, _model("a", sub=4.0), _model("b", sub=1.5), END],
                       [_edge("start", "a"), _edge("a", "b"), _edge("b", "end")]))
    assert not r.ok
    assert any("over-allocated" in e for e in r.errors)


def test_budget_exactly_equal_is_ok():
    r = validate(_spec([START, _model("a", sub=3.5), _model("b", sub=1.5), END],
                       [_edge("start", "a"), _edge("a", "b"), _edge("b", "end")]))
    assert r.ok


@given(budget=st.integers(min_value=1, max_value=100),
       subs=st.lists(st.integers(min_value=0, max_value=40), max_size=6))
def test_budget_rule_is_exact(budget, subs):
    nodes, edges, prev = [START], [], "start"
    for i, sb in enumerate(subs):
        nodes.append(_model(f"m{i}", sub=sb))
        edges.append(_edge(prev, f"m{i}"))
        prev = f"m{i}"
    nodes.append(END)
    edges.append(_edge(prev, "end"))
    r = validate(_spec(nodes, edges, budget_usd=budget))
    over = sum(subs) > budget
    assert any("over-allocated" in e for e in r.errors) == over
    if not over:
        assert r.ok  # a linear graph has no other issues


# --- structure -------------------------------------------------------------
def test_missing_start_errors():
    r = validate(_spec([_model("m"), END], [_edge("m", "end")]))
    assert any("exactly one 'start'" in e for e in r.errors)


def test_two_starts_error():
    r = validate(_spec([START, {"id": "s2", "type": "start"}, END],
                       [_edge("start", "end"), _edge("s2", "end")]))
    assert any("exactly one 'start'" in e for e in r.errors)


def test_no_end_errors():
    r = validate(_spec([START, _model("m")], [_edge("start", "m")]))
    assert any("at least one 'end'" in e for e in r.errors)


def test_edge_to_missing_node_errors():
    r = validate(_spec([START, END], [_edge("start", "ghost")]))
    assert any("don't exist" in e for e in r.errors)


def test_router_needs_two_outgoing_edges():
    r = validate(_spec([START, {"id": "r", "type": "router"}, END],
                       [_edge("start", "r"), _edge("r", "end", cond="only")]))
    assert any("≥2 outgoing" in e for e in r.errors)


def test_router_branches_need_conditions():
    r = validate(_spec([START, {"id": "r", "type": "router"}, _model("a"), END],
                       [_edge("start", "r"), _edge("r", "a"), _edge("r", "end", cond="done")]))
    assert any("no 'condition' label" in e for e in r.errors)


def test_model_requires_model_field():
    r = validate(_spec([START, {"id": "m", "type": "model", "max_tokens": 10}, END],
                       [_edge("start", "m"), _edge("m", "end")]))
    assert any("needs a 'model'" in e for e in r.errors)


def test_model_without_max_tokens_warns_not_errors():
    r = validate(_spec([START, {"id": "m", "type": "model", "model": "openai/gpt-4o"}, END],
                       [_edge("start", "m"), _edge("m", "end")]))
    assert r.ok  # a warning, not an error
    assert any("no max_tokens" in w for w in r.warnings)


def test_unknown_node_type_errors():
    r = validate(_spec([START, {"id": "x", "type": "agent"}, END],
                       [_edge("start", "x"), _edge("x", "end")]))
    assert any("unknown type" in e for e in r.errors)


def test_unknown_field_errors():
    r = validate(_spec([START, {"id": "m", "type": "model", "model": "openai/gpt-4o",
                                "max_tokens": 10, "temperature": 0.5}, END],
                       [_edge("start", "m"), _edge("m", "end")]))
    assert any("unknown field" in e for e in r.errors)


def test_unreachable_node_errors():
    r = validate(_spec([START, END, _model("orphan")], [_edge("start", "end")]))
    assert any("not reachable from start" in e for e in r.errors)


def test_self_loop_gets_cycle_note():
    r = validate(_spec([START, _model("m"), END],
                       [_edge("start", "m"), _edge("m", "m"), _edge("m", "end")]))
    assert any("Cycle detected" in n for n in r.notes)
