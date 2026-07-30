"""#152 — `breakerbox claudecode init`: install Claude Code budget hooks + the hook itself."""

import json
from datetime import date

import pytest

from breakerbox import claudecode
from breakerbox.claudecode_hook import check, reconcile
from breakerbox.pricing import cost_microusd


def _bbx_hooks(hooks: dict, event: str) -> list:
    return [
        e for e in hooks.get(event, [])
        if any("claudecode_hook" in h["command"] for h in e["hooks"])
    ]


def test_init_writes_three_hooks_preserves_user_hooks_and_is_idempotent(tmp_path):
    claude = tmp_path / ".claude"
    claude.mkdir()
    # a pre-existing user hook must survive the install
    (claude / "settings.json").write_text(
        json.dumps({"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command",
                                                               "command": "echo hi"}]}]}})
    )
    claudecode.init(tmp_path, session_ceiling_usd=5.0, daily_ceiling_usd=50.0)
    claudecode.init(tmp_path)  # second run — must not duplicate

    hooks = json.loads((claude / "settings.json").read_text())["hooks"]
    assert {"UserPromptSubmit", "PreToolUse", "Stop"} <= set(hooks)
    for event in ("UserPromptSubmit", "PreToolUse", "Stop"):
        assert len(_bbx_hooks(hooks, event)) == 1  # exactly one bbx entry, no dupes
    assert any(  # user's own hook preserved
        "echo hi" in h["command"] for e in hooks["UserPromptSubmit"] for h in e["hooks"]
    )
    assert _bbx_hooks(hooks, "PreToolUse")[0]["matcher"] == "Task|Bash"
    assert _bbx_hooks(hooks, "Stop")[0]["hooks"][0]["command"].endswith("reconcile")

    cfg = json.loads((tmp_path / ".claude" / "breakerbox" / "config.json").read_text())
    assert cfg["session_ceiling_micro"] == 5_000_000
    assert cfg["daily_ceiling_micro"] == 50_000_000


def test_check_blocks_when_session_ceiling_reached(tmp_path):
    claudecode.init(tmp_path, session_ceiling_usd=0.01, daily_ceiling_usd=1.0)  # 10_000 micro
    bbx = tmp_path / ".claude" / "breakerbox"
    (bbx / "state.json").write_text(
        json.dumps({"sessions": {"s1": {"cost_micro": 10_000, "date": date.today().isoformat()}}})
    )
    with pytest.raises(SystemExit) as exc:  # exit 2 == Claude Code blocking error
        check({"cwd": str(tmp_path), "session_id": "s1"})
    assert exc.value.code == 2


def test_check_allows_when_under_ceiling(tmp_path):
    claudecode.init(tmp_path, session_ceiling_usd=5.0, daily_ceiling_usd=50.0)
    assert check({"cwd": str(tmp_path), "session_id": "s1"}) == 0  # no state -> $0 spent


def test_reconcile_meters_transcript_into_state(tmp_path):
    claudecode.init(tmp_path)
    transcript = tmp_path / "transcript.jsonl"
    line = json.dumps(
        {"message": {"model": "openai/gpt-4o", "usage": {"input_tokens": 100, "output_tokens": 50}}}
    )
    transcript.write_text(line + "\n" + line + "\n")  # two priced turns
    assert reconcile({"cwd": str(tmp_path), "session_id": "s1",
                      "transcript_path": str(transcript)}) == 0
    state = json.loads((tmp_path / ".claude" / "breakerbox" / "state.json").read_text())
    assert state["sessions"]["s1"]["cost_micro"] == 2 * cost_microusd("openai/gpt-4o", 100, 50)


def test_cli_claudecode_init(tmp_path, capsys):
    from breakerbox.cli import main

    rc = main(["claudecode", "init", "-o", str(tmp_path),
               "--session-ceiling", "3", "--daily-ceiling", "30"])
    assert rc == 0
    settings = json.loads((tmp_path / ".claude" / "settings.json").read_text())
    assert {"UserPromptSubmit", "PreToolUse", "Stop"} <= set(settings["hooks"])
    assert "hooks installed" in capsys.readouterr().out
