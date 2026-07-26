"""Tests for #88 airgap egress certificate — static endpoint attestation from a spec."""

import json

from breakerbox import egress
from breakerbox.cli import main


def _spec(models, tools=()):
    nodes = [{"id": "s", "type": "start"}]
    nodes += [{"id": f"m{i}", "type": "model", "model": m} for i, m in enumerate(models)]
    nodes += [{"id": t, "type": "tool", "name": t} for t in tools]
    nodes.append({"id": "e", "type": "end"})
    return {"version": "1", "config": {}, "nodes": nodes, "edges": []}


def test_certify_known_providers():
    e = egress.certify(_spec(["openai/gpt-4o", "anthropic/claude-sonnet-4-6"]))
    assert e.model_hosts == ["api.anthropic.com", "api.openai.com"]
    assert e.unknown_models == []


def test_unknown_provider_flagged():
    e = egress.certify(_spec(["mystery/model-x"]))
    assert e.unknown_models == ["mystery/model-x"] and e.model_hosts == []


def test_tools_listed_as_implementation_defined():
    e = egress.certify(_spec(["openai/gpt-4o"], tools=["web_search", "send_email"]))
    assert e.tools == ["send_email", "web_search"]


def test_format_certificate():
    e = egress.certify(_spec(["openai/gpt-4o", "mystery/x"], tools=["t"]))
    out = egress.format_certificate(e)
    assert "api.openai.com" in out and "undeclared egress" in out and "mystery/x" in out


def test_cli_strict_fails_on_unknown_but_reports_otherwise(tmp_path):
    p = tmp_path / "g.json"
    p.write_text(json.dumps(_spec(["mystery/x"])))
    assert main(["egress", str(p), "--strict"]) == 1
    assert main(["egress", str(p)]) == 0  # non-strict just reports


def test_cli_strict_passes_and_json(tmp_path, capsys):
    p = tmp_path / "g.json"
    p.write_text(json.dumps(_spec(["openai/gpt-4o"])))
    assert main(["egress", str(p), "--strict"]) == 0
    capsys.readouterr()  # clear the text-cert output before the --json run
    assert main(["egress", str(p), "--json"]) == 0
    row = json.loads(capsys.readouterr().out.strip())
    assert row["model_hosts"] == ["api.openai.com"]
