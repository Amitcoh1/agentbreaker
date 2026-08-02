"""#T1 auto-baseline: turn observe-mode recordings into a cost profile + a suggested budget.

Observe mode (`guard(app)` with no budget) records real per-hop costs and enforces nothing. This
reads those run logs and answers the question a new user can't: *what should my budget be?* — the
per-run median/p95/p99, the top cost drivers, loop signatures, a suggested `breakerbox.yaml`
(review-only, never auto-applied), and how much a cap set at p95 would have prevented. No API calls;
pure aggregation over the JSONL event logs. Only *observe* runs (recorded with no budget) count, so
the baseline reflects true uncapped cost.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

_MICRO = 1_000_000
_LOOP_MIN = 8  # a single node firing this many times in one run reads as a loop signature


def _pct(sorted_vals: list[int], p: float) -> int:
    """Nearest-rank percentile of a pre-sorted list (empty → 0)."""
    if not sorted_vals:
        return 0
    k = max(0, math.ceil(p / 100 * len(sorted_vals)) - 1)
    return sorted_vals[min(k, len(sorted_vals) - 1)]


def _ceil_cent(usd: float) -> float:
    return math.ceil(usd * 100) / 100 if usd > 0 else 0.0


def _usd(micro: int) -> str:
    v = micro / _MICRO
    return f"${v:.2f}" if v >= 1 else f"${v:.4f}"


def aggregate_observe(report_dir) -> dict:
    """Cost profile over the observe runs under `report_dir`."""
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

    totals: list[int] = []
    by_node: Counter = Counter()
    by_model: Counter = Counter()
    loops: list[dict] = []
    observed = 0
    for rid, evs in runs.items():
        start = next((e for e in evs if e.get("type") == "start"), None)
        # only observe runs (recorded with no budget) are true uncapped cost
        if start is None or start.get("detail", {}).get("budget_micro") is not None:
            continue
        observed += 1
        # true run cost = sum of reconciled actuals; max(cumulative) would peak on reserve holds
        totals.append(
            sum(e.get("actual_microusd") or 0 for e in evs if e.get("type") == "reconcile")
        )
        per_run_calls: Counter = Counter()
        for e in evs:
            amount = e.get("actual_microusd") or 0
            node, model, etype = e.get("node"), e.get("model"), e.get("type")
            if etype == "reconcile":
                if node:
                    by_node[node] += amount
                if model:
                    by_model[model] += amount
            if etype in ("reconcile", "tool_call") and node:
                per_run_calls[node] += 1
        if per_run_calls:
            node, n = per_run_calls.most_common(1)[0]
            if n >= _LOOP_MIN:
                loops.append({"run_id": rid, "node": node, "calls": n})

    totals.sort()
    loops.sort(key=lambda x: -x["calls"])
    return {
        "runs": observed,
        "runs_scanned": len(runs),
        "median_micro": _pct(totals, 50),
        "p95_micro": _pct(totals, 95),
        "p99_micro": _pct(totals, 99),
        "max_micro": totals[-1] if totals else 0,
        "per_run_micro": totals,
        "by_node": dict(by_node.most_common(8)),
        "by_model": dict(by_model.most_common(8)),
        "loop_signatures": loops[:8],
    }


def suggest_policy(summary: dict) -> dict:
    """A starting budget: p95 rounded up, so normal runs pass and the tail stays bounded."""
    out: dict = {"budget_usd": _ceil_cent(summary["p95_micro"] / _MICRO)}
    calls = max((s["calls"] for s in summary["loop_signatures"]), default=0)
    if calls:
        out["max_hops"] = calls * 2  # headroom over the busiest observed node
    return out


def prevented_micro(summary: dict, budget_micro: int) -> int:
    """Spend beyond the cap, summed across runs — what a cap set here would have prevented."""
    return sum(max(0, t - budget_micro) for t in summary["per_run_micro"])


def _guard_line(suggestion: dict) -> str:
    hops = f", max_hops={suggestion['max_hops']}" if "max_hops" in suggestion else ""
    return f'guard(app, budget_usd={suggestion["budget_usd"]}{hops}, on_trip="pause")'


def render_observe(summary: dict, suggestion: dict) -> str:
    """One-screen terminal summary."""
    if summary["runs"] == 0:
        return (
            "No observe runs found. Wrap your app in guard(app) (no budget), run it a few times,\n"
            f"then re-run `breakerbox observe-report`. "
            f"({summary['runs_scanned']} non-observe run(s) skipped.)"
        )
    budget_micro = round(suggestion["budget_usd"] * _MICRO)
    lines = [
        f"Cost profile — {summary['runs']} observe run(s)",
        f"  per run:  median {_usd(summary['median_micro'])} · p95 {_usd(summary['p95_micro'])}"
        f" · p99 {_usd(summary['p99_micro'])} · max {_usd(summary['max_micro'])}",
    ]
    if summary["by_node"]:
        top = ", ".join(f"{k} {_usd(v)}" for k, v in list(summary["by_node"].items())[:3])
        lines.append(f"  top nodes:  {top}")
    if summary["by_model"]:
        items = list(summary["by_model"].items())[:3]
        top = ", ".join(f"{k.split('/')[-1]} {_usd(v)}" for k, v in items)
        lines.append(f"  top models: {top}")
    if summary["loop_signatures"]:
        s = summary["loop_signatures"][0]
        lines.append(f"  loop:       node '{s['node']}' fired {s['calls']}x in one run")
    if summary["runs"] < 10:
        lines.append(f"  (only {summary['runs']} runs — p95/p99 firm up with more)")
    lines += [
        "",
        "Suggested starting budget (review — never auto-applied):",
        f"  {_guard_line(suggestion)}",
        f"  a cap here would have prevented {_usd(prevented_micro(summary, budget_micro))}"
        " across these runs.",
    ]
    return "\n".join(lines)


def suggested_yaml(summary: dict, suggestion: dict) -> str:
    """A reviewable breakerbox.yaml (the policy-as-code format the CI gate reads)."""
    lines = [
        f"# Suggested by `breakerbox observe-report` from {summary['runs']} observed run(s) —"
        " review before committing.",
        f"# observed per run: median {_usd(summary['median_micro'])},"
        f" p95 {_usd(summary['p95_micro'])}, p99 {_usd(summary['p99_micro'])}."
        " max_ceiling_usd = p95 rounded up.",
        f"max_ceiling_usd: {suggestion['budget_usd']}",
    ]
    if "max_hops" in suggestion:
        lines.append(f"max_hops: {suggestion['max_hops']}")
    lines.append("require_bounded: true")
    return "\n".join(lines) + "\n"


def render_observe_html(summary: dict, suggestion: dict) -> str:
    """Self-contained, shareable single-file HTML (inline CSS, no JS)."""
    if summary["runs"] == 0:
        body = "<p>No observe runs found yet — run <code>guard(app)</code> a few times first.</p>"
    else:
        budget_micro = round(suggestion["budget_usd"] * _MICRO)
        rows = "".join(
            f"<tr><td>{k}</td><td class='n'>{_usd(v)}</td></tr>"
            for k, v in summary["by_node"].items()
        )
        body = f"""
        <div class="grid">
          <div class="stat"><span>MEDIAN</span><b>{_usd(summary['median_micro'])}</b></div>
          <div class="stat"><span>P95</span><b>{_usd(summary['p95_micro'])}</b></div>
          <div class="stat"><span>P99</span><b>{_usd(summary['p99_micro'])}</b></div>
          <div class="stat"><span>MAX</span><b>{_usd(summary['max_micro'])}</b></div>
        </div>
        <h2>Top cost nodes</h2>
        <table>{rows}</table>
        <div class="suggest">
          <div>Suggested starting budget</div>
          <code>{_guard_line(suggestion)}</code>
          <div>Would have prevented <b>{_usd(prevented_micro(summary, budget_micro))}</b>"""\
            f""" across {summary['runs']} runs.</div>
        </div>"""
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<title>Breakerbox — cost profile</title><style>"
        "body{background:#0b0d10;color:#f2f0e9;font:14px/1.6 system-ui,sans-serif;"
        "max-width:640px;margin:40px auto;padding:0 20px}"
        "h1{font-size:18px}h2{font-size:13px;color:#c9c6bd;margin-top:26px}"
        ".grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}"
        ".stat{border:1px solid rgba(242,240,233,.12);border-radius:10px;padding:12px}"
        ".stat span{display:block;font-size:10px;color:#8f8c84;letter-spacing:.08em}"
        ".stat b{font-size:20px}"
        "table{width:100%;border-collapse:collapse}"
        "td{padding:6px 0;border-bottom:1px solid rgba(242,240,233,.08)}"
        ".n{text-align:right;font-variant-numeric:tabular-nums}"
        ".suggest{margin-top:26px;border:1px solid rgba(212,160,23,.35);"
        "background:rgba(212,160,23,.08);border-radius:12px;padding:18px}"
        ".suggest code{display:block;margin:8px 0;color:#e8bb45;font-family:ui-monospace,monospace}"
        "</style></head><body>"
        f"<h1>Breakerbox — cost profile · {summary['runs']} observe run(s)</h1>{body}"
        "</body></html>"
    )
