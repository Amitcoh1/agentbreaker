"""CLI-level tests for the `breakerbox ceiling` budget gate (#5).

The exit code is the contract the CI action relies on: 0 = within limit, 1 = over/unbounded.
`test_ceiling.py` covers the core math; this covers the gate + multi-spec OR-semantics.
"""

import json

from breakerbox import ceiling
from breakerbox.cli import main

M = "openai/gpt-4o"  # priced in the bundled table


def _dag(tmp_path, name, config, max_tokens=1024):
    """A start→model→end spec; returns (path, its worst-case ceiling in USD)."""
    spec = {
        "version": "1",
        "config": config,
        "nodes": [
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": M, "max_tokens": max_tokens},
            {"id": "e", "type": "end"},
        ],
        "edges": [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],
    }
    p = tmp_path / name
    p.write_text(json.dumps(spec))
    return p, ceiling.cost_ceiling(spec).ceiling_usd


def test_no_max_always_passes(tmp_path):
    p, _ = _dag(tmp_path, "g.json", {"budget_usd": 5, "max_hops": 20})
    assert main(["ceiling", str(p)]) == 0


def test_under_limit_passes(tmp_path):
    p, ceil = _dag(tmp_path, "g.json", {"budget_usd": 5, "max_hops": 20})
    assert main(["ceiling", str(p), "--max", str(ceil + 1)]) == 0


def test_over_limit_fails(tmp_path, capsys):
    p, ceil = _dag(tmp_path, "g.json", {"budget_usd": 5, "max_hops": 20})
    assert main(["ceiling", str(p), "--max", str(ceil / 2)]) == 1
    assert "FAIL" in capsys.readouterr().out


def test_unbounded_fails_when_max_set(tmp_path, capsys):
    spec = {  # a loop with no max_hops is unbounded — only the budget stops it
        "version": "1",
        "config": {"budget_usd": 5},
        "nodes": [
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": M, "max_tokens": 1024},
            {"id": "r", "type": "router", "condition": "again"},
            {"id": "e", "type": "end"},
        ],
        "edges": [
            {"source": "s", "target": "a"},
            {"source": "a", "target": "r"},
            {"source": "r", "target": "a", "condition": "loop"},
            {"source": "r", "target": "e", "condition": "done"},
        ],
    }
    p = tmp_path / "loop.json"
    p.write_text(json.dumps(spec))
    assert main(["ceiling", str(p), "--max", "100"]) == 1
    assert "unbounded" in capsys.readouterr().out


def test_multi_spec_gate_is_or(tmp_path, capsys):
    cfg = {"budget_usd": 5, "max_hops": 20}
    small, c_small = _dag(tmp_path, "small.json", cfg, max_tokens=256)
    big, c_big = _dag(tmp_path, "big.json", cfg, max_tokens=8192)
    assert c_small < c_big  # bigger max_tokens → bigger worst-case
    limit = (c_small + c_big) / 2  # small passes, big fails
    rc = main(["ceiling", str(small), str(big), "--max", str(limit)])
    out = capsys.readouterr().out
    assert rc == 1  # any spec over the limit → overall fail
    assert "FAIL" in out
    assert str(small) in out and str(big) in out  # every spec checked + printed


def test_json_output_carries_spec_path(tmp_path, capsys):
    p, _ = _dag(tmp_path, "g.json", {"budget_usd": 5, "max_hops": 20})
    assert main(["ceiling", str(p), "--json"]) == 0
    row = json.loads(capsys.readouterr().out.strip())
    assert row["spec"] == str(p) and "ceiling_usd" in row
