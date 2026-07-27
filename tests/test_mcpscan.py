"""Tests for MCP posture checks (#134)."""

import json

from breakerbox import mcpscan
from breakerbox.cli import main


def _rules(findings):
    return {f.rule for f in findings}


def test_hardcoded_secret_in_env_flagged():
    cfg = {"mcpServers": {"gh": {"command": "server", "env": {"GITHUB_TOKEN": "ghp_" + "a" * 30}}}}
    f = mcpscan.scan_config(cfg)
    assert "hardcoded-secret" in _rules(f)
    assert f[0].severity == "high" and f[0].server == "gh"


def test_sensitive_name_with_literal_value_flagged():
    cfg = {"mcpServers": {"x": {"command": "s", "env": {"API_KEY": "plaintext-value-123"}}}}
    assert "hardcoded-secret" in _rules(mcpscan.scan_config(cfg))


def test_env_reference_is_not_a_secret():
    cfg = {"mcpServers": {"x": {"command": "s", "env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}}}}
    assert mcpscan.scan_config(cfg) == []  # externalized → clean


def test_unpinned_npx_flagged():
    cfg = {"mcpServers": {"fs": {"command": "npx", "args": ["-y", "@mcp/server-fs"]}}}
    assert "unpinned-supply-chain" in _rules(mcpscan.scan_config(cfg))


def test_pinned_npx_is_clean():
    cfg = {"mcpServers": {"fs": {"command": "npx", "args": ["@mcp/server-fs@1.4.2"]}}}
    assert mcpscan.scan_config(cfg) == []


def test_latest_is_treated_as_unpinned():
    cfg = {"mcpServers": {"fs": {"command": "npx", "args": ["some-pkg@latest"]}}}
    assert "unpinned-supply-chain" in _rules(mcpscan.scan_config(cfg))


def test_uvx_without_version_pin_flagged():
    cfg = {"mcpServers": {"py": {"command": "uvx", "args": ["mcp-server-git"]}}}
    assert "unpinned-supply-chain" in _rules(mcpscan.scan_config(cfg))
    pinned = {"mcpServers": {"py": {"command": "uvx", "args": ["mcp-server-git==0.6.2"]}}}
    assert mcpscan.scan_config(pinned) == []


def test_insecure_transport_flagged():
    cfg = {"mcpServers": {"remote": {"type": "http", "url": "http://mcp.example.com/sse"}}}
    assert "insecure-transport" in _rules(mcpscan.scan_config(cfg))
    secure = {"mcpServers": {"remote": {"type": "http", "url": "https://mcp.example.com/sse"}}}
    assert mcpscan.scan_config(secure) == []


def test_static_bearer_in_headers_flagged():
    hdr = {"Authorization": "Bearer abc.def.ghi123"}
    cfg = {"mcpServers": {"r": {"url": "https://x", "headers": hdr}}}
    assert "static-token-in-headers" in _rules(mcpscan.scan_config(cfg))
    ref = {"mcpServers": {"r": {"url": "https://x", "headers": {"Authorization": "${TOKEN}"}}}}
    assert mcpscan.scan_config(ref) == []


def test_clean_config_has_no_findings():
    cfg = {"mcpServers": {
        "fs": {"command": "npx", "args": ["@modelcontextprotocol/server-fs@1.4.2"],
               "env": {"ROOT": "${WORKSPACE}"}},
        "api": {"url": "https://mcp.example.com", "headers": {"Authorization": "${TOKEN}"}},
    }}
    assert mcpscan.scan_config(cfg) == []


def test_deterministic_order_by_server():
    cfg = {"mcpServers": {
        "zeta": {"command": "npx", "args": ["-y", "z"]},
        "alpha": {"command": "npx", "args": ["-y", "a"]},
    }}
    assert [f.server for f in mcpscan.scan_config(cfg)] == ["alpha", "zeta"]


def test_cli_strict_and_json(tmp_path, capsys):
    cfg = tmp_path / "mcp.json"
    cfg.write_text(json.dumps({"mcpServers": {"gh": {"command": "s",
                   "env": {"GITHUB_TOKEN": "ghp_" + "b" * 30}}}}))
    assert main(["mcp", str(cfg), "--strict"]) == 1
    assert main(["mcp", str(cfg)]) == 0  # informative without --strict
    capsys.readouterr()
    assert main(["mcp", str(cfg), "--json"]) == 0
    row = json.loads(capsys.readouterr().out.strip())
    assert row["rule"] == "hardcoded-secret" and row["config"] == str(cfg)


def test_cli_strict_passes_on_clean(tmp_path):
    cfg = tmp_path / "clean.json"
    cfg.write_text(json.dumps({"mcpServers": {"fs": {"command": "npx", "args": ["pkg@1.0.0"]}}}))
    assert main(["mcp", str(cfg), "--strict"]) == 0
