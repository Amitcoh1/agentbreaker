"""#151 — aggregate would-trip events from shadow-mode runs into a report.

Shadow mode records a `would_trip` event (per reason) instead of enforcing, so a report over a
directory of run logs answers: *what would have tripped this week, and how much spend would have
been prevented?* — the adoption unlock (VISION §3.3): see the enforcement before you enable it.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


def aggregate_shadow(report_dir: str | Path) -> dict:
    """Scan every `*.jsonl` run log under `report_dir` and summarise its would-trip events."""
    runs: dict[str, list[dict]] = {}
    for p in sorted(Path(report_dir).glob("*.jsonl")):
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            runs.setdefault(ev.get("run_id", p.stem), []).append(ev)

    by_reason: Counter = Counter()
    by_policy: Counter = Counter()
    prevented = 0
    top: list[dict] = []
    for run_id, evs in runs.items():
        would = [e for e in evs if e.get("type") == "would_trip"]
        if not would:
            continue
        first = min(would, key=lambda e: e.get("seq", 0))
        for e in would:
            by_reason[e.get("detail", {}).get("reason")] += 1
            by_policy[e.get("detail", {}).get("policy")] += 1
        # spend that happened AFTER the first would-trip is what enforcement would have prevented
        final = max((e.get("cumulative_microusd") or 0) for e in evs)
        run_prevented = max(0, final - (first.get("cumulative_microusd") or 0))
        prevented += run_prevented
        top.append({
            "run_id": run_id,
            "reason": first.get("detail", {}).get("reason"),
            "prevented_micro": run_prevented,
        })
    top.sort(key=lambda r: r["prevented_micro"], reverse=True)
    return {
        "runs_scanned": len(runs),
        "runs_would_trip": len(top),
        "by_reason": dict(by_reason),
        "by_policy": dict(by_policy),
        "would_prevent_micro": prevented,
        "would_prevent_usd": round(prevented / 1_000_000, 6),
        "top_runs": top[:10],
    }


def render_shadow(summary: dict) -> str:
    """Human-readable one-screen summary of a shadow report."""
    lines = [
        f"Shadow report — {summary['runs_would_trip']}/{summary['runs_scanned']} "
        "run(s) would have tripped",
        f"  would have prevented: ${summary['would_prevent_usd']:.4f}",
    ]
    if summary["by_reason"]:
        lines.append("  by reason:")
        for reason, n in sorted(summary["by_reason"].items(), key=lambda kv: -kv[1]):
            lines.append(f"    {reason}: {n}")
    return "\n".join(lines)
