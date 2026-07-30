"""`breakerbox claudecode init` (#152) — wire Breakerbox budget enforcement into Claude Code.

Enforcement lives in the execution path (VISION §3.4): three Claude Code hooks that gate on a
session / daily dollar ceiling and meter the transcript. Codegen-only — this installs config +
settings hooks that call the installed `breakerbox.claudecode_hook`; no server, no stored keys.
Re-running is idempotent: it replaces its own hook entries and leaves any others untouched.
"""

from __future__ import annotations

import json
from pathlib import Path

_CHECK = "python3 -m breakerbox.claudecode_hook check"
_RECONCILE = "python3 -m breakerbox.claudecode_hook reconcile"
_MARK = "breakerbox.claudecode_hook"  # identifies our entries for idempotent re-install


def _to_micro(usd: float | None) -> int | None:
    return None if usd is None else round(usd * 1_000_000)


def _entry(command: str, matcher: str | None = None) -> dict:
    entry = {"hooks": [{"type": "command", "command": command}]}
    if matcher is not None:
        entry["matcher"] = matcher
    return entry


def _is_bbx(entry: dict) -> bool:
    return any(_MARK in (h.get("command") or "") for h in entry.get("hooks", []))


def _merge_hooks(settings: dict) -> None:
    """Add/refresh our three hooks; drop stale Breakerbox entries; keep the user's own hooks."""
    hooks = settings.setdefault("hooks", {})
    plan = {
        "UserPromptSubmit": _entry(_CHECK),
        "PreToolUse": _entry(_CHECK, matcher="Task|Bash"),
        "Stop": _entry(_RECONCILE),
    }
    for event, entry in plan.items():
        kept = [e for e in hooks.get(event, []) if not _is_bbx(e)]
        hooks[event] = [*kept, entry]


def init(
    target_dir: str | Path = ".",
    session_ceiling_usd: float | None = 5.0,
    daily_ceiling_usd: float | None = 50.0,
    otel_endpoint: str | None = None,
) -> dict:
    """Install/refresh the hooks + config under `target_dir/.claude/`. Returns a summary dict."""
    root = Path(target_dir)
    bbx_dir = root / ".claude" / "breakerbox"
    bbx_dir.mkdir(parents=True, exist_ok=True)

    config = {
        "session_ceiling_micro": _to_micro(session_ceiling_usd),
        "daily_ceiling_micro": _to_micro(daily_ceiling_usd),
        "otel_endpoint": otel_endpoint,
    }
    (bbx_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    state_path = bbx_dir / "state.json"
    if not state_path.exists():  # never clobber accumulated spend on re-init
        state_path.write_text('{"sessions": {}}\n')

    settings_path = root / ".claude" / "settings.json"
    settings = {}
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text())
        except json.JSONDecodeError:
            settings = {}
    _merge_hooks(settings)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")

    return {
        "settings_path": str(settings_path),
        "config_path": str(bbx_dir / "config.json"),
        "session_ceiling": session_ceiling_usd,
        "daily_ceiling": daily_ceiling_usd,
        "otel_endpoint": otel_endpoint,
    }
