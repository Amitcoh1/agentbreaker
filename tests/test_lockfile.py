"""Tests for the #81 Cost Lockfile — pin the price table + ceiling, detect drift in CI."""

import json

from breakerbox import lockfile
from breakerbox.cli import main


def _spec(tmp_path, mt=1024):
    spec = {
        "version": "1",
        "config": {"budget_usd": 5, "max_hops": 20},
        "nodes": [
            {"id": "s", "type": "start"},
            {"id": "a", "type": "model", "model": "openai/gpt-4o", "max_tokens": mt},
            {"id": "e", "type": "end"},
        ],
        "edges": [{"source": "s", "target": "a"}, {"source": "a", "target": "e"}],
    }
    p = tmp_path / "g.spec.json"
    p.write_text(json.dumps(spec))
    return p


def test_build_lock_pins_version_and_ceiling(tmp_path):
    lock = lockfile.build_lock([str(_spec(tmp_path))])
    assert lock["lock_version"] == 1
    assert lock["price_table_version"]  # e.g. "2026-07-24"
    (entry,) = lock["specs"].values()
    assert entry["bounded"] and entry["ceiling_usd"] > 0


def test_clean_lock_has_no_drift(tmp_path):
    assert lockfile.check_lock(lockfile.build_lock([str(_spec(tmp_path))])) == []


def test_price_table_change_is_drift(tmp_path):
    lock = lockfile.build_lock([str(_spec(tmp_path))])
    lock["price_table_version"] = "1999-01-01"  # simulate an older locked table
    assert any(d.kind == "price_table" for d in lockfile.check_lock(lock))


def test_ceiling_change_is_drift(tmp_path):
    lock = lockfile.build_lock([str(_spec(tmp_path))])
    next(iter(lock["specs"].values()))["ceiling_usd"] = 999.0  # tamper
    assert any(d.kind == "ceiling" for d in lockfile.check_lock(lock))


def test_missing_spec_is_drift(tmp_path):
    lock = lockfile.build_lock([str(_spec(tmp_path))])
    lock["specs"] = {"/no/such.spec.json": next(iter(lock["specs"].values()))}
    assert any(d.kind == "missing" for d in lockfile.check_lock(lock))


def test_cli_write_then_check_is_clean(tmp_path):
    p, lockf = _spec(tmp_path), tmp_path / "breakerbox.lock"
    assert main(["lock", str(p), "-f", str(lockf)]) == 0
    assert lockf.exists()
    assert main(["lock", "--check", "-f", str(lockf)]) == 0


def test_cli_check_detects_drift(tmp_path, capsys):
    p, lockf = _spec(tmp_path), tmp_path / "breakerbox.lock"
    main(["lock", str(p), "-f", str(lockf)])
    data = json.loads(lockf.read_text())
    next(iter(data["specs"].values()))["ceiling_usd"] = 999.0
    lockf.write_text(json.dumps(data))
    assert main(["lock", "--check", "-f", str(lockf)]) == 1
    assert "DRIFT" in capsys.readouterr().out
