"""Flow scanning (#135) — static security analysis of an exported agent flow.

A flow definition is executable code that holds live secrets and wires untrusted content into
actions. This scans an exported flow (Langflow to start) WITHOUT running it and reports:

  - embedded-credential (high): a secret hardcoded in a node, instead of a stored/global variable
    — the CVE-2026-55255 scenario (attackers harvested credentials embedded in hijacked flows).
  - unguarded-action (high): a side-effecting node (send / write / execute / sql …) reachable from
    an untrusted-input node (web / search / retrieval / email …) with no approval step in between.

Same finding shape as `breakerbox dow` / `breakerbox mcp` so results feed the CI findings-baseline
(#131). Static, offline, no payload generation. Langflow first; n8n/Dify/CrewAI can follow.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_ENV_REF = re.compile(r"^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$")
_SECRET_NAME = re.compile(r"(?i)(secret|token|api[_-]?key|apikey|password|passwd|auth|credential)")

# Node-role keyword sets (matched against a node's type + display name, lowercased). Heuristic and
# tunable — precision over recall: keep action verbs specific so a plain chat/RAG flow stays clean.
_UNTRUSTED = ("url", "web", "search", "apirequest", "request", "retriever", "webhook", "scrape",
              "crawl", "rss", "wikipedia", "arxiv", "email", "gmail", "fetch")
_ACTION = ("send", "email", "gmail", "slack", "post", "write", "delete", "execute", "shell",
           "pythonrepl", "python_repl", "sql", "database", "webhook")
_APPROVAL = ("human", "approve", "approval", "confirm", "review", "hitl")


@dataclass
class FlowFinding:
    rule: str
    severity: str  # "high" | "medium" | "low"
    node: str  # the offending node (the location)
    message: str

    def as_dict(self) -> dict:
        return {"rule": self.rule, "severity": self.severity,
                "node": self.node, "message": self.message}


def _langflow_nodes(flow: dict) -> list[dict]:
    data = flow.get("data") if isinstance(flow.get("data"), dict) else flow
    nodes = []
    for n in (data.get("nodes") or []):
        if not isinstance(n, dict):
            continue
        nd = n.get("data") if isinstance(n.get("data"), dict) else {}
        node = nd.get("node") if isinstance(nd.get("node"), dict) else {}
        nodes.append({
            "id": n.get("id") or "",
            "type": str(nd.get("type") or node.get("type") or ""),
            "name": str(node.get("display_name") or nd.get("type") or n.get("id") or ""),
            "template": node.get("template") if isinstance(node.get("template"), dict) else {},
        })
    return nodes


def _langflow_edges(flow: dict) -> list[tuple[str, str]]:
    data = flow.get("data") if isinstance(flow.get("data"), dict) else flow
    out = []
    for e in (data.get("edges") or []):
        if isinstance(e, dict) and e.get("source") and e.get("target"):
            out.append((e["source"], e["target"]))
    return out


def _is_ref(value: str) -> bool:
    return bool(_ENV_REF.match(value.strip()))


def _scan_credentials(node: dict) -> list[FlowFinding]:
    out = []
    for fname, field in node["template"].items():
        if not isinstance(field, dict) or field.get("load_from_db"):
            continue  # a stored/global variable is the secure pattern — not a finding
        value = field.get("value")
        is_secret = field.get("password") is True or bool(_SECRET_NAME.search(str(fname)))
        if is_secret and isinstance(value, str) and value.strip() and not _is_ref(value):
            out.append(FlowFinding("embedded-credential", "high", node["name"],
                f"field {fname!r} embeds a literal secret in the flow — move it to a stored/global "
                "variable so an exported or hijacked flow can't leak the credential."))
    return out


def _classify(node: dict) -> tuple[bool, bool, bool]:
    hay = f"{node['type']} {node['name']}".lower()
    return (any(k in hay for k in _UNTRUSTED),
            any(k in hay for k in _ACTION),
            any(k in hay for k in _APPROVAL))


def _unguarded_actions(nodes: list[dict], edges: list[tuple[str, str]]) -> list[FlowFinding]:
    by_id = {n["id"]: n for n in nodes}
    adj: dict[str, list[str]] = {}
    for s, t in edges:
        adj.setdefault(s, []).append(t)
    cls = {n["id"]: _classify(n) for n in nodes}
    findings: list[FlowFinding] = []
    flagged: set[str] = set()
    for n in sorted(nodes, key=lambda x: x["id"]):  # deterministic order for stable baselines
        if not cls.get(n["id"], (False, False, False))[0]:  # not an untrusted source
            continue
        seen: set[str] = set()
        stack = list(adj.get(n["id"], []))
        while stack:
            u = stack.pop()
            if u in seen:
                continue
            seen.add(u)
            _, act, gate = cls.get(u, (False, False, False))
            if gate:
                continue  # an approval / human step gates the taint — stop propagating here
            if act and u not in flagged:
                flagged.add(u)
                findings.append(FlowFinding("unguarded-action", "high", by_id[u]["name"],
                    f"reachable from untrusted input ({n['name']}) with no approval step — a "
                    "side-effecting action can be driven by attacker-controlled content."))
            stack.extend(adj.get(u, []))
    return findings


def scan_flow(flow: dict) -> list[FlowFinding]:
    """Audit an exported flow (Langflow). Deterministic order for stable baseline fingerprints."""
    nodes = _langflow_nodes(flow)
    findings: list[FlowFinding] = []
    for n in sorted(nodes, key=lambda x: x["id"]):
        findings.extend(_scan_credentials(n))
    findings.extend(_unguarded_actions(nodes, _langflow_edges(flow)))
    return findings


def load_flow(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


_RANK = {"high": 3, "medium": 2, "low": 1}


def format_findings(findings: list[FlowFinding]) -> str:
    if not findings:
        return ("No flow findings — no embedded secrets, no untrusted input reaching an ungated "
                "action.")
    lines = []
    for f in sorted(findings, key=lambda x: (-_RANK.get(x.severity, 0), x.node, x.rule)):
        lines.append(f"[{f.severity.upper()}] {f.rule} — node {f.node!r}")
        lines.append(f"  {f.message}")
    n = len(findings)
    lines.append(f"\n{n} flow finding{'s' if n != 1 else ''}.")
    return "\n".join(lines)
