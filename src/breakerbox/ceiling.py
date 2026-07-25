"""Provable worst-case cost ceiling (#79) — a static upper bound on what a graph can cost, computed
with NO API calls. Mirrors cloud/dashboard/lib/costCeiling.ts (the builder read-out).

Unlike the forecast (a p50–p95 *estimate*), this is an upper *bound*: every reachable model hop is
charged at its full max_tokens (plus a fixed input assumption), and a graph with a loop is charged
max_hops of the single costliest hop. A loop with no max_hops is honestly reported as unbounded —
only the budget stops it. Powers `breakerbox ceiling` and the CI budget gate (#5).
"""

from __future__ import annotations

from dataclasses import dataclass

from breakerbox.pricing import MICRO_PER_USD, PriceTable, UnknownModelError

# Same per-call input assumption as the builder's pricing.ts, so the CLI and the on-canvas read-out
# agree. Real input varies; the ceiling documents this simplification.
INPUT_ASSUMPTION = 1000


@dataclass
class CostCeiling:
    ceiling_usd: float | None  # upper bound over priced reachable models; None when unbounded
    bounded: bool  # structurally bounded without relying on the budget to trip?
    basis: str  # "dag-sum" | "hops-cap" | "empty"
    max_hops: int | None
    costliest_hop_usd: float
    unpriced_models: list[str]  # reachable unpriced models (excluded; true bound is higher)
    budget_usd: float | None
    budget_binds: bool  # budget < structural ceiling → the guard's budget is the effective cap


def _reachable(nodes: list, edges: list, start_id: str) -> tuple[set[str], dict[str, list[str]]]:
    ids = {n["id"] for n in nodes if isinstance(n, dict) and "id" in n}
    adj: dict[str, list[str]] = {}
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = e.get("source"), e.get("target")
        if s in ids and t in ids:
            adj.setdefault(s, []).append(t)
    seen: set[str] = set()
    stack = [start_id]
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        stack.extend(adj.get(u, []))
    return seen, adj


def _has_cycle(reachable: set[str], adj: dict[str, list[str]]) -> bool:
    color: dict[str, int] = {}  # 1 = on stack, 2 = done

    def visit(u: str) -> bool:
        color[u] = 1
        for v in adj.get(u, []):
            if v not in reachable:
                continue
            c = color.get(v)
            if c == 1:
                return True
            if c is None and visit(v):
                return True
        color[u] = 2
        return False

    return any(color.get(n) is None and visit(n) for n in reachable)


def _hop_usd(model, max_tokens, table: PriceTable) -> float | None:
    try:
        micro = table.cost_microusd(model, INPUT_ASSUMPTION, int(max_tokens or 1024))
    except UnknownModelError:
        return None
    return micro / MICRO_PER_USD


def cost_ceiling(spec: dict, *, table: PriceTable | None = None) -> CostCeiling:
    table = table or PriceTable.load(unknown_model="fail")
    nodes = spec.get("nodes") or []
    edges = spec.get("edges") or []
    by_id = {n["id"]: n for n in nodes if isinstance(n, dict) and "id" in n}
    config = spec.get("config") or {}
    max_hops = config.get("max_hops")
    budget = config.get("budget_usd")
    start = next((n for n in nodes if isinstance(n, dict) and n.get("type") == "start"), None)
    if start is None:
        return CostCeiling(None, False, "empty", max_hops, 0.0, [], budget, False)

    reachable, adj = _reachable(nodes, edges, start["id"])
    costliest = 0.0
    total = 0.0
    unpriced: list[str] = []
    for nid in reachable:
        n = by_id[nid]
        if n.get("type") != "model":
            continue
        c = _hop_usd(n.get("model"), n.get("max_tokens"), table)
        if c is None:
            unpriced.append(nid)
            continue
        costliest = max(costliest, c)
        total += c
    unpriced.sort()

    def binds(ceil: float | None) -> bool:
        return budget is not None and ceil is not None and budget < ceil

    if costliest == 0.0:
        return CostCeiling(0.0, True, "empty", max_hops, 0.0, unpriced, budget, False)

    if _has_cycle(reachable, adj):
        ceil = max_hops * costliest if max_hops is not None else None
        return CostCeiling(
            ceil, ceil is not None, "hops-cap", max_hops, costliest, unpriced, budget, binds(ceil)
        )

    return CostCeiling(total, True, "dag-sum", max_hops, costliest, unpriced, budget, binds(total))


def _fmt_usd(v: float | None) -> str:
    if v is None:
        return "—"
    return f"${v:.2f}" if abs(v) >= 1 else f"${v:.4f}"


def format_ceiling(c: CostCeiling) -> str:
    """A human-readable proof, for the CLI."""
    lines: list[str] = []
    if c.ceiling_usd is None and not c.bounded and c.basis == "empty":
        return "No start node — cannot compute a ceiling."
    if not c.bounded:
        lines.append("Worst-case ceiling: UNBOUNDED")
        lines.append(
            "  A reachable loop has no max_hops — only the budget "
            f"({_fmt_usd(c.budget_usd)}) stops it. Set max_hops for a provable ceiling."
        )
        return "\n".join(lines)
    lines.append(f"Worst-case ceiling: ≤ {_fmt_usd(c.ceiling_usd)}  (proven, no API calls)")
    if c.basis == "hops-cap":
        hop = _fmt_usd(c.costliest_hop_usd)
        lines.append(f"  Basis: {c.max_hops} hops × the costliest call ({hop}).")
    elif c.basis == "dag-sum":
        lines.append("  Basis: every reachable step at full max_tokens, no loops.")
    else:
        lines.append("  Basis: no priced model cost on any reachable path.")
    if c.budget_binds:
        b = _fmt_usd(c.budget_usd)
        lines.append(f"  The budget ({b}) is the binding cap — the guard trips first.")
    if c.unpriced_models:
        names = ", ".join(c.unpriced_models)
        n = len(c.unpriced_models)
        lines.append(f"  {n} unpriced node(s) excluded ({names}) — true ceiling is higher.")
    return "\n".join(lines)


# Compact code-comment form of the ceiling, emitted into the generated Python header (#79).
# MUST stay byte-identical to cloud/dashboard/lib/costCeiling.ts:ceilingComment — keep in lockstep.
_REPROVE = "#   Run `breakerbox ceiling <spec>.json` to re-prove at current prices."


def ceiling_comment(c: CostCeiling) -> list[str]:
    """Header comment lines (each already prefixed with `#`). Empty list = emit nothing."""
    if not c.bounded:
        if c.basis == "empty":  # no start node — degenerate; say nothing
            return []
        if c.budget_usd is not None:
            stops = f"only budget_usd={_fmt_usd(c.budget_usd)} stops it"
        else:
            stops = "and no budget_usd is set — this run has no cap"
        return [
            f"# ⚠ Cost ceiling: UNBOUNDED — a reachable loop has no max_hops; {stops}.",
            "#   Set max_hops in the spec for a provable bound.",
        ]
    if c.basis == "empty":
        if c.unpriced_models:
            n = len(c.unpriced_models)
            return [
                f"# Cost ceiling: not priced — {n} reachable "
                "model step(s) use unpriced models."
            ]
        return ["# Cost ceiling: ≤ $0.00 (no priced model steps)."]
    ceil = _fmt_usd(c.ceiling_usd)
    if c.basis == "hops-cap":
        hop = _fmt_usd(c.costliest_hop_usd)
        head = (
            f"# Cost ceiling: ≤ {ceil} (proven, {c.max_hops} hops × {hop}) "
            f"— bounded by max_hops={c.max_hops}."
        )
    else:  # dag-sum
        head = (
            f"# Cost ceiling: ≤ {ceil} (proven, every reachable step "
            "at full max_tokens, no loops)."
        )
    lines = [head]
    if c.unpriced_models:
        n = len(c.unpriced_models)
        lines.append(f"#   (+ {n} unpriced step(s) — the true ceiling is higher.)")
    lines.append(_REPROVE)
    return lines
