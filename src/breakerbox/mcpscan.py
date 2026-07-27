"""MCP server posture checks (#134) — a static audit of an agent's MCP configuration.

Reads an MCP config (the `mcpServers` map used by Claude Desktop / Claude Code / `.mcp.json`) and
reports posture findings WITHOUT connecting to any server — offline, no payload generation, no deps:

  - hardcoded secrets in a server's `env` / `args` (a token literal, not a ${VAR} reference)
  - unpinned supply chain (`npx`/`uvx` running @latest or an unversioned package — pulled fresh
    every launch, the tool-description-poisoning / typosquat vector)
  - non-TLS transport for a remote server (http://)
  - a static bearer token in `headers` (not externalized to an env reference)

Emits the same finding shape as `breakerbox dow` (#130) so results feed the CI findings-baseline
(#131). This is a static config linter — it never launches or contacts a server.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_ENV_REF = re.compile(r"^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$")  # ${VAR} / $VAR — externalized, fine
_SENSITIVE_NAME = re.compile(
    r"(?i)(secret|token|api[_-]?key|apikey|password|passwd|auth|credential)"
)
_KNOWN_SECRET = [
    re.compile(r"sk-[A-Za-z0-9]{16,}"),                       # OpenAI
    re.compile(r"gh[posru]_[A-Za-z0-9]{20,}"),                # GitHub
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),              # Slack
    re.compile(r"AKIA[0-9A-Z]{16}"),                          # AWS access key id
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),                    # Google API key
    re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{4,}"),  # JWT
]
_NODE_RUNNERS = {"npx", "bunx", "pnpx"}


@dataclass
class McpFinding:
    rule: str
    severity: str  # "high" | "medium" | "low"
    server: str  # which MCP server the finding is on (the location)
    message: str

    def as_dict(self) -> dict:
        return {"rule": self.rule, "severity": self.severity,
                "server": self.server, "message": self.message}


def _is_ref(value: str) -> bool:
    return bool(_ENV_REF.match(value.strip()))


def _known_secret(value: str) -> bool:
    return any(p.search(value) for p in _KNOWN_SECRET)


def _pinned(pkg: str) -> bool:
    """A node package spec is pinned if it carries an @version that isn't @latest."""
    body = pkg[1:] if pkg.startswith("@") else pkg  # drop a leading @scope/
    return "@" in body and not body.endswith("@latest")


def _servers(config: dict) -> dict:
    for key in ("mcpServers", "servers"):
        if isinstance(config.get(key), dict):
            return config[key]
    # the whole document may BE the servers map (each value a server dict)
    if config and all(isinstance(v, dict) for v in config.values()):
        return config
    return {}


def _scan_server(name: str, s: dict) -> list[McpFinding]:
    out: list[McpFinding] = []

    # 1. secrets in env / args (a literal token, not a ${VAR} reference)
    env = s.get("env") if isinstance(s.get("env"), dict) else {}
    for k, v in env.items():
        v = "" if v is None else str(v)
        if not v or _is_ref(v):
            continue
        if _known_secret(v) or _SENSITIVE_NAME.search(str(k)):
            out.append(McpFinding("hardcoded-secret", "high", name,
                f"env var {k!r} holds a literal secret — externalize it to ${{{k}}}."))
    args = s.get("args") if isinstance(s.get("args"), list) else []
    for a in args:
        if isinstance(a, str) and not _is_ref(a) and _known_secret(a):
            out.append(McpFinding("hardcoded-secret", "high", name,
                "a command arg contains a token literal — pass it via env, not argv."))

    # 2. unpinned supply chain
    cmd = str(s.get("command") or "")
    pos = [a for a in args if isinstance(a, str) and not a.startswith("-")]
    if cmd in _NODE_RUNNERS:
        auto = any(a in ("-y", "--yes") for a in args)
        pkg = pos[0] if pos else ""
        if auto or (pkg and not _pinned(pkg)):
            out.append(McpFinding("unpinned-supply-chain", "medium", name,
                f"{cmd} runs an unpinned package ({pkg or 'auto-installed'}) — pin @<version> so a "
                "poisoned or typosquatted release can't be pulled on the next launch."))
    elif cmd == "uvx":
        if not any(isinstance(a, str) and "==" in a for a in args):
            out.append(McpFinding("unpinned-supply-chain", "medium", name,
                "uvx runs an unpinned package — pin ==<version> to freeze the supply chain."))

    # 3. transport (remote servers only)
    url = str(s.get("url") or "")
    if url.startswith("http://"):
        out.append(McpFinding("insecure-transport", "high", name,
            "remote MCP server over http:// — traffic (and any token) is in the clear; use https."))

    # 4. static bearer token in headers
    headers = s.get("headers") if isinstance(s.get("headers"), dict) else {}
    for hk, hv in headers.items():
        hv = "" if hv is None else str(hv)
        if not hv or _is_ref(hv):
            continue
        if re.search(r"(?i)authorization|x-api-key|api[_-]?key", hk) or _known_secret(hv):
            out.append(McpFinding("static-token-in-headers", "high", name,
                f"header {hk!r} carries a static token — externalize it to a ${{VAR}} reference."))
    return out


def scan_config(config: dict) -> list[McpFinding]:
    """Audit an MCP config document. Deterministic order (by server name) for stable baselines."""
    findings: list[McpFinding] = []
    for name in sorted(_servers(config)):
        s = _servers(config)[name]
        if isinstance(s, dict):
            findings.extend(_scan_server(name, s))
    return findings


def load_mcp_config(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


_RANK = {"high": 3, "medium": 2, "low": 1}


def format_findings(findings: list[McpFinding]) -> str:
    if not findings:
        return ("No MCP posture findings — secrets externalized, supply chain pinned, "
                "transport secure.")
    lines = []
    for f in sorted(findings, key=lambda x: (-_RANK.get(x.severity, 0), x.server, x.rule)):
        lines.append(f"[{f.severity.upper()}] {f.rule} — server {f.server!r}")
        lines.append(f"  {f.message}")
    n = len(findings)
    lines.append(f"\n{n} posture finding{'s' if n != 1 else ''}.")
    return "\n".join(lines)
