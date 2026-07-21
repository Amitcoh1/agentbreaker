"""AgentBreaker graph spec: a versioned JSON interchange format + a validator.

The spec (see graph.example.json) is what the visual builder produces and codegen consumes.
The validator is hand-rolled (no jsonschema dep — a JSON Schema only covers structure; our
signature rules are semantic) and returns human-readable errors / warnings / notes.

Rules:
  ERROR   Σ(sub_budget_usd) ≤ config.budget_usd; exactly one start + ≥1 end; edges reference
          real nodes; every node reachable from start; routers have ≥2 labelled outgoing edges;
          model needs `model`; unknown types/fields rejected (forward-compat via `version`).
  WARN    a model node without max_tokens (reserve under-counts → the overshoot rule).
  NOTE    a cycle (allowed — budget/max_hops is what bounds the loop).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from importlib.resources import files
from pathlib import Path

SPEC_VERSION = "1"
NODE_TYPES = {"start", "end", "model", "tool", "router"}
_NODE_FIELDS: dict[str, set[str]] = {
    "start": set(),
    "end": set(),
    "model": {"model", "max_tokens", "sub_budget_usd"},
    "tool": {"name", "side_effecting"},
    "router": {"condition"},
}
_CONFIG_FIELDS = {"budget_usd", "max_hops", "ttl_seconds", "velocity_usd_per_min", "on_trip"}
_EDGE_FIELDS = {"source", "target", "condition"}
_TOP_FIELDS = {"version", "config", "nodes", "edges"}
_ON_TRIP = {"pause", "kill"}
_EPS = 1e-9


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def load_spec(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def example_spec() -> dict:
    return json.loads(files("agentbreaker").joinpath("graph.example.json").read_text())


def to_json(spec: dict) -> str:
    return json.dumps(spec, indent=2)


def from_json(text: str) -> dict:
    return json.loads(text)


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate(spec: dict) -> ValidationResult:
    r = ValidationResult()
    if not isinstance(spec, dict):
        r.errors.append("Spec must be a JSON object.")
        return r

    unknown = set(spec) - _TOP_FIELDS
    if unknown:
        r.errors.append(
            f"Unknown top-level field(s): {sorted(unknown)}. Expected {sorted(_TOP_FIELDS)}."
        )
    if str(spec.get("version")) != SPEC_VERSION:
        r.errors.append(
            f"Unsupported spec version {spec.get('version')!r}; this build understands "
            f"version {SPEC_VERSION!r}."
        )

    config = spec.get("config")
    _validate_config(config, r)

    nodes = spec.get("nodes")
    edges = spec.get("edges")
    if not isinstance(nodes, list):
        r.errors.append("Spec needs a 'nodes' array.")
        nodes = []
    if not isinstance(edges, list):
        r.errors.append("Spec needs an 'edges' array.")
        edges = []

    ids = _validate_nodes(nodes, r)
    good_edges = _validate_edges(edges, ids, r)
    _validate_budget(config if isinstance(config, dict) else {}, nodes, r)
    _validate_routers(nodes, edges, r)
    _validate_connectivity(nodes, good_edges, ids, r)
    _detect_cycles(good_edges, r)
    return r


def _validate_config(config, r: ValidationResult) -> None:
    if not isinstance(config, dict):
        r.errors.append("Spec needs a 'config' object with at least budget_usd.")
        return
    unknown = set(config) - _CONFIG_FIELDS
    if unknown:
        r.errors.append(
            f"config has unknown field(s) {sorted(unknown)}; expected {sorted(_CONFIG_FIELDS)}."
        )
    if not _num(config.get("budget_usd")) or config.get("budget_usd", 0) <= 0:
        r.errors.append("config.budget_usd is required and must be a positive number.")
    on_trip = config.get("on_trip")
    if on_trip is not None and on_trip not in _ON_TRIP:
        r.errors.append(f"config.on_trip must be 'pause' or 'kill' (got {on_trip!r}).")
    mh = config.get("max_hops")
    if mh is not None and (not isinstance(mh, int) or isinstance(mh, bool) or mh <= 0):
        r.errors.append("config.max_hops must be a positive integer.")
    for k in ("ttl_seconds", "velocity_usd_per_min"):
        v = config.get(k)
        if v is not None and (not _num(v) or v < 0):
            r.errors.append(f"config.{k} must be a number ≥ 0.")


def _validate_nodes(nodes, r: ValidationResult) -> set[str]:
    ids: set[str] = set()
    starts = ends = 0
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            r.errors.append(f"Node #{i} must be an object.")
            continue
        nid = n.get("id")
        if not isinstance(nid, str) or not nid:
            r.errors.append(f"Node #{i} needs a non-empty string 'id'.")
            continue
        if nid in ids:
            r.errors.append(f"Duplicate node id {nid!r}.")
        ids.add(nid)
        ntype = n.get("type")
        if ntype not in NODE_TYPES:
            r.errors.append(
                f"Node {nid!r} has unknown type {ntype!r} (expected {sorted(NODE_TYPES)})."
            )
            continue
        extra = set(n) - {"id", "type"} - _NODE_FIELDS[ntype]
        if extra:
            r.errors.append(
                f"Node {nid!r} (type {ntype}) has unknown field(s) {sorted(extra)}; "
                "unknown fields are rejected for forward-compatibility."
            )
        if ntype == "start":
            starts += 1
        elif ntype == "end":
            ends += 1
        elif ntype == "model":
            if not n.get("model"):
                r.errors.append(f"Model node {nid!r} needs a 'model' (e.g. 'openai/gpt-4o').")
            if "max_tokens" not in n:
                r.warnings.append(
                    f"Model node {nid!r} has no max_tokens: the reserve uses a default upper "
                    "bound, so the budget cap may be enforced one hop late (the overshoot rule). "
                    "Declare max_tokens to stop strictly under budget."
                )
            sb = n.get("sub_budget_usd")
            if sb is not None and (not _num(sb) or sb < 0):
                r.errors.append(f"Model node {nid!r} sub_budget_usd must be a number ≥ 0.")
        elif ntype == "tool":
            if not n.get("name"):
                r.errors.append(f"Tool node {nid!r} needs a 'name'.")
            se = n.get("side_effecting")
            if se is not None and not isinstance(se, bool):
                r.errors.append(f"Tool node {nid!r} side_effecting must be true or false.")
    if starts != 1:
        r.errors.append(f"A workflow needs exactly one 'start' node (found {starts}).")
    if ends < 1:
        r.errors.append("A workflow needs at least one 'end' node (found 0).")
    return ids


def _validate_edges(edges, ids: set[str], r: ValidationResult) -> list[tuple]:
    good: list[tuple] = []
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            r.errors.append(f"Edge #{i} must be an object.")
            continue
        extra = set(e) - _EDGE_FIELDS
        if extra:
            r.errors.append(f"Edge #{i} has unknown field(s) {sorted(extra)}.")
        s, t = e.get("source"), e.get("target")
        if s is None or t is None:
            r.errors.append(f"Edge #{i} needs both 'source' and 'target'.")
            continue
        missing = [x for x in (s, t) if x not in ids]
        if missing:
            r.errors.append(f"Edge {s!r} → {t!r} references node(s) that don't exist: {missing}.")
        else:
            good.append((s, t, e.get("condition")))
    return good


def _validate_budget(config: dict, nodes, r: ValidationResult) -> None:
    budget = config.get("budget_usd")
    if not _num(budget) or budget <= 0:
        return  # already reported by config validation
    total = sum(
        n["sub_budget_usd"]
        for n in nodes
        if isinstance(n, dict) and n.get("type") == "model" and _num(n.get("sub_budget_usd"))
    )
    if total > budget + _EPS:
        r.errors.append(
            f"Budget over-allocated: node sub-budgets total ${total:.2f} but config.budget_usd is "
            f"only ${budget:.2f}. Lower a node's sub_budget_usd or raise the workflow budget."
        )


def _validate_routers(nodes, edges, r: ValidationResult) -> None:
    for n in nodes:
        if not (isinstance(n, dict) and n.get("type") == "router"):
            continue
        rid = n.get("id")
        outs = [e for e in edges if isinstance(e, dict) and e.get("source") == rid]
        if len(outs) < 2:
            r.errors.append(
                f"Router node {rid!r} needs ≥2 outgoing edges (found {len(outs)}); routers branch."
            )
        no_cond = [e.get("target") for e in outs if not e.get("condition")]
        if no_cond:
            r.errors.append(
                f"Router node {rid!r} has outgoing edge(s) with no 'condition' label "
                f"(to {no_cond}). Each branch of a router needs a condition."
            )


def _validate_connectivity(nodes, good_edges, ids: set[str], r: ValidationResult) -> None:
    starts = [n.get("id") for n in nodes if isinstance(n, dict) and n.get("type") == "start"]
    if len(starts) != 1:
        return  # start-count error already emitted
    adj: dict[str, list[str]] = {}
    for s, t, _c in good_edges:
        adj.setdefault(s, []).append(t)
    seen: set[str] = set()
    stack = [starts[0]]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(adj.get(cur, []))
    unreachable = sorted(ids - seen)
    if unreachable:
        r.errors.append(
            f"Node(s) not reachable from start: {unreachable}. "
            "Connect them with an edge or remove them."
        )


def _detect_cycles(good_edges, r: ValidationResult) -> None:
    adj: dict[str, list[str]] = {}
    for s, t, _c in good_edges:
        adj.setdefault(s, []).append(t)
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {}
    found: list[list[str]] = []

    def dfs(u: str, path: list[str]) -> None:
        color[u] = GRAY
        path.append(u)
        for v in adj.get(u, []):
            if color.get(v, WHITE) == GRAY:
                found.append(path[path.index(v):] + [v])
            elif color.get(v, WHITE) == WHITE:
                dfs(v, path)
        path.pop()
        color[u] = BLACK

    for u in list(adj.keys()):
        if color.get(u, WHITE) == WHITE:
            dfs(u, [])

    seen: set[frozenset] = set()
    for cyc in found:
        key = frozenset(cyc)
        if key in seen:
            continue
        seen.add(key)
        r.notes.append(
            f"Cycle detected: {' → '.join(cyc)}. Cycles are allowed — your budget and max_hops "
            "are the only things bounding this loop."
        )
