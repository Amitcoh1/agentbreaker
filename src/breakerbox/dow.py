"""Denial-of-wallet assessment (#130) — the provable cost ceiling, reframed as a security finding.

A graph whose worst-case cost is UNBOUNDED (a reachable loop with no max_hops) is a denial-of-wallet
vulnerability: a crafted input can loop the agent and burn spend without limit — only the budget, if
one is set, caps the per-invocation loss. This reuses cost_ceiling (zero API calls) and reframes
the result as a finding (severity + the offending loop + worst-case $/invocation) for security
review and CI, instead of as a plain cost read-out.
"""

from __future__ import annotations

from dataclasses import dataclass

from breakerbox.ceiling import _fmt_usd, _reachable, cost_ceiling
from breakerbox.pricing import PriceTable


@dataclass
class DowFinding:
    rule: str  # always "denial-of-wallet"
    severity: str  # "critical" | "high" | "none"
    unbounded: bool
    worst_case_usd: float | None  # per-invocation worst case; None = truly unbounded (no cap)
    loop_nodes: list[str]  # the reachable uncapped loop — the attack surface (empty when safe)
    budget_usd: float | None
    message: str

    def as_dict(self) -> dict:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "unbounded": self.unbounded,
            "worst_case_usd": self.worst_case_usd,
            "loop_nodes": self.loop_nodes,
            "budget_usd": self.budget_usd,
            "message": self.message,
        }


def _cycle_nodes(reachable: set[str], adj: dict[str, list[str]]) -> list[str]:
    """Node ids on the first cycle within the reachable set — the denial-of-wallet attack surface.

    Deterministic (starts from sorted nodes, follows edge order) so the same spec always names the
    same loop — important for the findings baseline (#131) to fingerprint it stably.
    """
    color: dict[str, int] = {}  # 1 = on the current path, 2 = fully explored
    path: list[str] = []
    cycle: list[str] = []

    def visit(u: str) -> bool:
        color[u] = 1
        path.append(u)
        for v in adj.get(u, []):
            if v not in reachable:
                continue
            if color.get(v) == 1:  # back-edge — the loop runs from v to the current head
                cycle[:] = path[path.index(v) :]
                return True
            if color.get(v) is None and visit(v):
                return True
        path.pop()
        color[u] = 2
        return False

    for n in sorted(reachable):
        if color.get(n) is None and visit(n):
            break
    return cycle


def _loop_nodes(spec: dict) -> list[str]:
    nodes = spec.get("nodes") or []
    edges = spec.get("edges") or []
    start = next((n for n in nodes if isinstance(n, dict) and n.get("type") == "start"), None)
    if start is None:
        return []
    reachable, adj = _reachable(nodes, edges, start["id"])
    return _cycle_nodes(reachable, adj)


def assess_dow(spec: dict, *, table: PriceTable | None = None) -> DowFinding:
    """Assess a spec for denial-of-wallet exposure via its provable cost ceiling. No API calls."""
    c = cost_ceiling(spec, table=table)
    # A structurally-bounded ceiling — or a degenerate no-start / no-priced-cost graph — is not a
    # DoW vuln: the worst case is provably finite (or there is nothing to spend).
    if c.bounded or c.basis == "empty":
        if c.bounded and c.basis != "empty":
            bound = _fmt_usd(c.ceiling_usd)
            msg = f"No denial-of-wallet exposure — worst case is provably ≤ {bound}."
        else:
            msg = "No denial-of-wallet exposure — no unbounded reachable loop."
        return DowFinding("denial-of-wallet", "none", False, c.ceiling_usd, [], c.budget_usd, msg)

    # Unbounded: a reachable loop has no max_hops. Severity turns on whether ANY cap exists.
    loop = _loop_nodes(spec)
    if c.budget_usd is None:
        return DowFinding(
            "denial-of-wallet", "critical", True, None, loop, None,
            "A reachable loop has no max_hops AND no budget_usd is set — a crafted input can loop "
            "the agent and burn spend without any cap.",
        )
    return DowFinding(
        "denial-of-wallet", "high", True, c.budget_usd, loop, c.budget_usd,
        f"A reachable loop has no max_hops — only budget_usd={_fmt_usd(c.budget_usd)} caps the "
        "per-invocation loss, and it is spent in full on every attack. Set max_hops to bound it.",
    )


def format_dow(f: DowFinding) -> str:
    """Human-readable finding for the CLI."""
    if f.severity == "none":
        return f.message
    lines = [f"[{f.severity.upper()}] Denial-of-wallet", f"  {f.message}"]
    if f.loop_nodes:
        lines.append(f"  Attack surface: uncapped loop through {' → '.join(f.loop_nodes)}.")
    if f.worst_case_usd is None:
        lines.append("  Worst-case loss: UNBOUNDED per invocation.")
    else:
        lines.append(f"  Worst-case loss: {_fmt_usd(f.worst_case_usd)} per invocation, repeatable.")
    return "\n".join(lines)
