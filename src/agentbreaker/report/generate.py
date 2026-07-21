"""The receipt: JSON + single-file HTML report, built ONLY from the event stream.

Everything the receipt shows is derived from the per-run JSONL (spec 9.4). The
headline projection is deliberately conservative: mean cost-per-hop times the hop
ceiling — a lower bound on what a real runaway would have cost, labelled as such.
"""

from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATE_DIR = Path(__file__).parent
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)

_SPARK_W, _SPARK_H = 640, 90


def _usd(micro: int | None) -> float:
    return (micro or 0) / 1_000_000


def _money(usd: float) -> str:
    return f"${usd:,.2f}" if abs(usd) >= 1 else f"${usd:.4f}"


def load_events(path: str | Path) -> list[dict]:
    lines = Path(path).read_text().splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def summarize(events: list[dict]) -> dict:
    start = next((e for e in events if e["type"] == "start"), {})
    detail = start.get("detail", {})
    budget_micro = detail.get("budget_micro", 0)
    max_hops = detail.get("max_hops", 0)

    timeline: list[dict] = []
    for e in events:
        if e["type"] == "reconcile":
            timeline.append({
                "kind": "llm", "node": e.get("node"), "model": e.get("model"),
                "tokens_in": e.get("tokens_in") or 0, "tokens_out": e.get("tokens_out") or 0,
                "actual_micro": e.get("actual_microusd") or 0,
                "cumulative_micro": e.get("cumulative_microusd") or 0,
                "side_effecting": False,
                "discrepancy": (e.get("detail") or {}).get("discrepancy"),
            })
        elif e["type"] == "tool_call":
            timeline.append({
                "kind": "tool", "node": e.get("node"), "model": None,
                "tokens_in": 0, "tokens_out": 0, "actual_micro": 0,
                "cumulative_micro": e.get("cumulative_microusd") or 0,
                "side_effecting": e.get("side_effecting", False), "discrepancy": None,
            })

    # Status = the LAST terminal event by seq — so a run that paused then resumed to a
    # finish reads as completed, not paused (trip fires just before pause, so pause wins there).
    terminal = None
    for e in events:
        if e["type"] in ("trip", "pause", "finish"):
            terminal = e["type"]
    status = {"trip": "killed", "pause": "paused", "finish": "completed"}.get(terminal, "unknown")
    trip = next((e for e in events if e["type"] == "trip"), None)
    trip_reason = (trip.get("detail") or {}).get("reason") if trip and status != "completed" else None

    spent_micro = timeline[-1]["cumulative_micro"] if timeline else 0
    cost_hops = sum(1 for t in timeline if t["actual_micro"] > 0)
    if status == "completed" or cost_hops == 0 or not max_hops:
        projected_micro = spent_micro
    else:
        projected_micro = max(round(spent_micro / cost_hops * max_hops), spent_micro)

    max_actual = max((t["actual_micro"] for t in timeline), default=0)
    for t in timeline:
        t["actual_usd"] = _usd(t["actual_micro"])
        t["cumulative_usd"] = _usd(t["cumulative_micro"])
        t["bar_pct"] = round(100 * t["actual_micro"] / max_actual, 1) if max_actual else 0.0

    saved_micro = max(projected_micro - spent_micro, 0)
    return {
        "run_id": events[0]["run_id"] if events else "",
        "status": status,
        "trip_reason": trip_reason,
        "hops": len(timeline),
        "max_hops": max_hops,
        "budget_usd": _usd(budget_micro),
        "spent_usd": _usd(spent_micro),
        "projected_uncapped_usd": _usd(projected_micro),
        "saved_usd": _usd(saved_micro),
        "budget_disp": _money(_usd(budget_micro)),
        "spent_disp": _money(_usd(spent_micro)),
        "projected_disp": _money(_usd(projected_micro)),
        "saved_disp": _money(_usd(saved_micro)),
        "timeline": timeline,
        "side_effects_fired": [t["node"] for t in timeline if t["side_effecting"]],
    }


def _sparkline(timeline: list[dict]) -> str:
    vals = [t["cumulative_usd"] for t in timeline] or [0.0]
    top = max(vals) or 1.0
    if len(vals) == 1:
        pts = [(0, _SPARK_H), (_SPARK_W, _SPARK_H - vals[0] / top * _SPARK_H)]
    else:
        n = len(vals) - 1
        pts = [(i / n * _SPARK_W, _SPARK_H - v / top * _SPARK_H) for i, v in enumerate(vals)]
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def render_html(summary: dict) -> str:
    template = _env.get_template("template.html.j2")
    return template.render(r=summary, spark_points=_sparkline(summary["timeline"]))


def render_terminal(summary: dict) -> str:
    r = summary
    rule = "─" * 56
    head = f" AgentBreaker receipt · {r['status']}"
    if r["trip_reason"]:
        head += f" ({r['trip_reason']})"
    lines = [
        rule,
        head,
        f" hops {r['hops']}   spent {r['spent_disp']}   budget {r['budget_disp']}",
        f" projected uncapped {r['projected_disp']}  →  stopped at {r['spent_disp']}",
    ]
    if r["side_effects_fired"]:
        lines.append(f" ⚠ side-effects fired: {', '.join(r['side_effects_fired'])}")
    lines.append(rule)
    return "\n".join(lines)


def write_report(run_id: str, events_path: str | Path, out_dir: str | Path) -> tuple[Path, dict]:
    summary = summarize(load_events(events_path))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{run_id}.report.json").write_text(json.dumps(summary, indent=2))
    html_path = out / f"{run_id}.html"
    html_path.write_text(render_html(summary))
    return html_path, summary
