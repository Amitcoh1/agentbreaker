"""Policy-as-code (#86): a versioned breakerbox.yaml whose rules codegen enforces at build time.

Compile-time *refusal* — the policy is a precondition of the artifact existing, not removable server
config: a non-compliant graph won't emit. Rules are checked against the spec (+ its ceiling) before
`breakerbox build` emits Python. Kept out of graphspec.validate() so the byte-parity TS mirror stays
untouched. Complements #74 (runtime templates) as one source of truth for destructive⇒approval.

Supported rules (all optional; a breakerbox.yaml sets any subset):

    max_ceiling_usd: 5.00      # the graph's provable worst-case ceiling must be <= this
    max_node_cost_usd: 1.00    # no single model hop may cost more than this ("no node > $1")
    max_hops: 20               # config.max_hops must be set and <= this
    require_bounded: true      # the ceiling must be bounded (no unbounded loops)
    banned_models: ["openai/o1"]
    allow_destructive: false   # refuse graphs containing destructive-class tools
"""

from __future__ import annotations

from dataclasses import dataclass

from breakerbox.ceiling import cost_ceiling


@dataclass
class Violation:
    rule: str
    message: str


def load_policy(path) -> dict:
    from pathlib import Path

    import yaml

    return yaml.safe_load(Path(path).read_text()) or {}


def check_policy(spec: dict, policy: dict) -> list[Violation]:
    """Return every policy violation for a spec (empty = compliant)."""
    out: list[Violation] = []
    c = cost_ceiling(spec)
    nodes = spec.get("nodes") or []
    config = spec.get("config") or {}

    def add(rule: str, message: str) -> None:
        out.append(Violation(rule, message))

    if policy.get("require_bounded") and not c.bounded:
        add("require_bounded", "cost ceiling is UNBOUNDED — a loop has no max_hops")

    cap = policy.get("max_ceiling_usd")
    if cap is not None and c.ceiling_usd is not None and c.ceiling_usd > cap:
        add("max_ceiling_usd", f"ceiling ${c.ceiling_usd:.2f} exceeds policy ${cap:.2f}")

    node_cap = policy.get("max_node_cost_usd")
    if node_cap is not None and c.costliest_hop_usd > node_cap:
        add("max_node_cost_usd", f"costliest hop ${c.costliest_hop_usd:.4f} over ${node_cap:.4f}")

    hop_cap = policy.get("max_hops")
    if hop_cap is not None:
        mh = config.get("max_hops")
        if mh is None:
            add("max_hops", f"config.max_hops not set (policy requires <= {hop_cap})")
        elif mh > hop_cap:
            add("max_hops", f"max_hops {mh} exceeds policy max {hop_cap}")

    banned = set(policy.get("banned_models") or [])
    used = sorted(banned & {n.get("model") for n in nodes if n.get("type") == "model"})
    if used:
        add("banned_models", f"banned model(s) used: {', '.join(used)}")

    if policy.get("allow_destructive") is False:
        d = [
            n["id"]
            for n in nodes
            if n.get("type") == "tool" and n.get("side_effect_class") == "destructive"
        ]
        if d:
            add("allow_destructive", f"destructive tool(s) not allowed: {', '.join(d)}")

    return out
