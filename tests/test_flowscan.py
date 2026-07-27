"""Tests for flow scanning (#135) — Langflow-shaped exports."""

import json

from breakerbox import flowscan
from breakerbox.cli import main


def _node(nid, type_, template=None, name=None):
    return {"id": nid, "data": {"type": type_,
            "node": {"display_name": name or type_, "template": template or {}}}}


def _flow(nodes, edges):
    return {"data": {"nodes": nodes,
            "edges": [{"source": s, "target": t} for s, t in edges]}}


def _rules(findings):
    return sorted(f.rule for f in findings)


def test_embedded_credential_flagged():
    flow = _flow([_node("m", "OpenAIModel",
                 {"api_key": {"password": True, "value": "sk-live-abc123"}})], [])
    f = flowscan.scan_flow(flow)
    assert _rules(f) == ["embedded-credential"]
    assert f[0].severity == "high"


def test_secret_by_field_name_flagged():
    flow = _flow([_node("m", "Custom", {"openai_api_key": {"value": "plaintext-secret"}})], [])
    assert "embedded-credential" in _rules(flowscan.scan_flow(flow))


def test_global_variable_reference_is_clean():
    flow = _flow([_node("m", "OpenAIModel",
                 {"api_key": {"password": True, "value": "OPENAI_KEY", "load_from_db": True}})], [])
    assert flowscan.scan_flow(flow) == []


def test_empty_secret_value_is_clean():
    flow = _flow([_node("m", "OpenAIModel", {"api_key": {"password": True, "value": ""}})], [])
    assert flowscan.scan_flow(flow) == []


def test_untrusted_to_action_flagged():
    # URL (untrusted) -> model -> Gmail (action). No approval between -> unguarded.
    flow = _flow(
        [_node("url", "URL", name="Fetch URL"),
         _node("m", "OpenAIModel"),
         _node("send", "GmailSender", name="Send Email")],
        [("url", "m"), ("m", "send")],
    )
    f = flowscan.scan_flow(flow)
    assert "unguarded-action" in _rules(f)
    assert any(x.node == "Send Email" for x in f)


def test_approval_node_gates_the_taint():
    # URL -> model -> Human Approval -> Gmail. The approval step gates it -> clean.
    flow = _flow(
        [_node("url", "URL", name="Fetch URL"),
         _node("m", "OpenAIModel"),
         _node("hitl", "HumanApproval", name="Human Approval"),
         _node("send", "GmailSender", name="Send Email")],
        [("url", "m"), ("m", "hitl"), ("hitl", "send")],
    )
    assert flowscan.scan_flow(flow) == []


def test_action_without_untrusted_source_is_clean():
    # Chat input -> model -> Gmail. Chat input is not an external/untrusted source.
    flow = _flow(
        [_node("in", "ChatInput", name="Chat Input"),
         _node("m", "OpenAIModel"),
         _node("send", "GmailSender", name="Send Email")],
        [("in", "m"), ("m", "send")],
    )
    assert flowscan.scan_flow(flow) == []


def test_plain_rag_flow_is_clean():
    # Retriever -> model -> Chat Output: untrusted source but no action node -> clean.
    flow = _flow(
        [_node("r", "Retriever", name="Vector Retriever"),
         _node("m", "OpenAIModel"),
         _node("out", "ChatOutput", name="Chat Output")],
        [("r", "m"), ("m", "out")],
    )
    assert flowscan.scan_flow(flow) == []


def test_cli_strict_and_json(tmp_path, capsys):
    tmpl = {"api_key": {"password": True, "value": "sk-xyz789"}}
    flow = _flow([_node("m", "OpenAIModel", tmpl)], [])
    p = tmp_path / "flow.json"
    p.write_text(json.dumps(flow))
    assert main(["flow", str(p), "--strict"]) == 1
    assert main(["flow", str(p)]) == 0
    capsys.readouterr()
    assert main(["flow", str(p), "--json"]) == 0
    row = json.loads(capsys.readouterr().out.strip())
    assert row["rule"] == "embedded-credential" and row["flow"] == str(p)


def test_cli_strict_passes_on_clean(tmp_path):
    flow = _flow([_node("m", "OpenAIModel",
                 {"api_key": {"password": True, "value": "K", "load_from_db": True}})], [])
    p = tmp_path / "clean.json"
    p.write_text(json.dumps(flow))
    assert main(["flow", str(p), "--strict"]) == 0
