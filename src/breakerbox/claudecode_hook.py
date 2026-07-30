"""Breakerbox × Claude Code budget hook (#152).

Installed by `breakerbox claudecode init` and invoked by Claude Code as:
  - `python3 -m breakerbox.claudecode_hook check`      (UserPromptSubmit / PreToolUse gate)
  - `python3 -m breakerbox.claudecode_hook reconcile`  (Stop: meter the transcript)

Standalone by design — no server call, no stored keys. Config + state live in the project's
`.claude/breakerbox/` dir; `check` is pure stdlib (blocks near a ceiling), `reconcile` reuses the
Breakerbox price table to turn the session transcript into a local dollar total.

Session spend is recomputed from the transcript each reconcile (idempotent), and daily spend is the
sum of today's per-session totals — so re-running a hook never double-counts.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date


def _bbx_dir(event: dict) -> str:
    root = event.get("cwd") or os.getcwd()
    return os.path.join(root, ".claude", "breakerbox")


def _load(path: str, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _read_event() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def check(event: dict) -> int:
    """Block (exit 2) when the session or daily ceiling is already reached; else allow (exit 0)."""
    d = _bbx_dir(event)
    cfg = _load(os.path.join(d, "config.json"), {})
    state = _load(os.path.join(d, "state.json"), {})
    sessions = state.get("sessions", {})
    sid = event.get("session_id", "unknown")
    today = date.today().isoformat()
    session_micro = sessions.get(sid, {}).get("cost_micro", 0)
    daily_micro = sum(s.get("cost_micro", 0) for s in sessions.values() if s.get("date") == today)

    sc, dc = cfg.get("session_ceiling_micro"), cfg.get("daily_ceiling_micro")
    if sc is not None and session_micro >= sc:
        _block("session", session_micro, sc)
    if dc is not None and daily_micro >= dc:
        _block("daily", daily_micro, dc)
    return 0


def _block(scope: str, spent_micro: int, ceiling_micro: int) -> None:
    print(
        f"⏻ breakerbox: {scope} budget reached "
        f"(${spent_micro / 1e6:.4f} / ${ceiling_micro / 1e6:.2f}). Blocked.",
        file=sys.stderr,
    )
    sys.exit(2)


def reconcile(event: dict) -> int:
    """Recompute this session's cost from the transcript and persist it to the local state file."""
    d = _bbx_dir(event)
    os.makedirs(d, exist_ok=True)
    sid = event.get("session_id", "unknown")
    cost_micro = _transcript_cost(event.get("transcript_path"))
    state_path = os.path.join(d, "state.json")
    state = _load(state_path, {})
    today = date.today().isoformat()
    state.setdefault("sessions", {})[sid] = {"cost_micro": cost_micro, "date": today}
    with open(state_path, "w") as f:
        json.dump(state, f)
    return 0


def _transcript_cost(path: str | None) -> int:
    if not path:
        return 0
    try:
        from breakerbox.pricing import cost_microusd
    except ImportError:  # pragma: no cover - breakerbox is present when its own hook runs
        return 0
    total = 0
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                usage, model = _usage_of(row)
                if usage is None:
                    continue
                try:
                    total += cost_microusd(model, usage["input_tokens"], usage["output_tokens"])
                except Exception:  # noqa: BLE001 - an unknown model shouldn't break metering
                    pass
    except OSError:
        return 0
    return total


def _usage_of(row: dict) -> tuple[dict | None, str]:
    """Pull (usage, model) from a transcript line, tolerating Anthropic / OpenAI field names."""
    msg = row.get("message") or {}
    usage = msg.get("usage") or row.get("usage")
    model = msg.get("model") or row.get("model") or "default_rate"
    if not usage:
        return None, model
    norm = {
        "input_tokens": usage.get("input_tokens") or usage.get("prompt_tokens") or 0,
        "output_tokens": usage.get("output_tokens") or usage.get("completion_tokens") or 0,
    }
    return norm, model


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    cmd = argv[0] if argv else "check"
    event = _read_event()
    return reconcile(event) if cmd == "reconcile" else check(event)


if __name__ == "__main__":
    raise SystemExit(main())
