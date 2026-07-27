"""Tests for the findings regression baseline (#131)."""

import json

from breakerbox import findings
from breakerbox.cli import main

# Realistic scanner rows (as emitted by dow/mcp/flow --json).
FLOW_CRED = {"flow": "a.json", "rule": "embedded-credential", "severity": "high", "node": "OpenAI"}
MCP_SECRET = {"config": "mcp.json", "rule": "hardcoded-secret", "severity": "high", "server": "gh"}
DOW_UNBOUNDED = {"spec": "p.json", "rule": "denial-of-wallet", "severity": "critical",
                 "loop_nodes": ["agent", "route"]}
DOW_CLEAN = {"spec": "ok.json", "rule": "denial-of-wallet", "severity": "none", "loop_nodes": []}


def test_fingerprint_is_stable_and_specific():
    fp = findings.fingerprint(FLOW_CRED)
    assert fp == findings.fingerprint(dict(FLOW_CRED))  # stable across equal dicts
    assert fp != findings.fingerprint({**FLOW_CRED, "node": "Anthropic"})  # location matters
    assert fp != findings.fingerprint({**FLOW_CRED, "rule": "unguarded-action"})  # rule matters
    assert fp != findings.fingerprint({**FLOW_CRED, "flow": "b.json"})  # source matters
    # severity/message are NOT part of identity (same finding, re-graded, stays the same id)
    assert fp == findings.fingerprint({**FLOW_CRED, "severity": "low", "message": "x"})


def test_build_baseline_skips_clean_rows():
    base = findings.build_baseline([FLOW_CRED, DOW_CLEAN, DOW_UNBOUNDED])
    assert len(base["fingerprints"]) == 2  # DOW_CLEAN (severity none) excluded


def test_check_flags_new_keeps_known():
    base = findings.build_baseline([FLOW_CRED, MCP_SECRET])
    res = findings.check_baseline([FLOW_CRED, MCP_SECRET, DOW_UNBOUNDED], base)
    assert [f["rule"] for f in res.new] == ["denial-of-wallet"]  # only the unbaselined one
    assert len(res.known) == 2
    assert res.fixed == []


def test_check_reports_fixed():
    base = findings.build_baseline([FLOW_CRED, MCP_SECRET])
    res = findings.check_baseline([FLOW_CRED], base)  # MCP_SECRET resolved
    assert res.new == [] and len(res.known) == 1
    assert res.fixed == [findings.fingerprint(MCP_SECRET)]


def test_load_findings_jsonl_and_array():
    jsonl = json.dumps(FLOW_CRED) + "\n\n" + json.dumps(MCP_SECRET)
    assert len(findings.load_findings(jsonl)) == 2
    arr = json.dumps([FLOW_CRED, MCP_SECRET])
    assert len(findings.load_findings(arr)) == 2
    assert findings.load_findings("  ") == []


def _write(p, rows):
    p.write_text("\n".join(json.dumps(r) for r in rows))


def test_cli_full_cycle(tmp_path, capsys):
    findings_file = tmp_path / "f.jsonl"
    base_file = tmp_path / "baseline.json"
    _write(findings_file, [FLOW_CRED, MCP_SECRET])

    # check with no baseline -> fail with guidance
    assert main(["baseline", str(findings_file), "-f", str(base_file)]) == 1
    assert "no baseline" in capsys.readouterr().out

    # create the baseline
    assert main(["baseline", str(findings_file), "-f", str(base_file), "--update"]) == 0
    assert base_file.exists()
    capsys.readouterr()

    # unchanged -> passes
    assert main(["baseline", str(findings_file), "-f", str(base_file)]) == 0
    assert "no new findings" in capsys.readouterr().out

    # a NEW finding appears -> fail, and it's named
    _write(findings_file, [FLOW_CRED, MCP_SECRET, DOW_UNBOUNDED])
    assert main(["baseline", str(findings_file), "-f", str(base_file)]) == 1
    out = capsys.readouterr().out
    assert "NEW:" in out and "denial-of-wallet" in out

    # accept it -> passes again
    assert main(["baseline", str(findings_file), "-f", str(base_file), "--update"]) == 0
    capsys.readouterr()
    assert main(["baseline", str(findings_file), "-f", str(base_file)]) == 0


def test_cli_update_creates_parent_dir(tmp_path):
    findings_file = tmp_path / "f.jsonl"
    _write(findings_file, [FLOW_CRED])
    nested = tmp_path / ".breakerbox" / "findings-baseline.json"
    assert main(["baseline", str(findings_file), "-f", str(nested), "--update"]) == 0
    assert nested.exists()
