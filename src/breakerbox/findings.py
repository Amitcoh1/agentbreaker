"""Findings regression baseline (#131) — turn one-off scans into a recurring CI gate.

The security scanners (`breakerbox dow` / `mcp` / `flow`) each emit findings as JSON with `--json`.
This records an accepted set of them as fingerprints in `.breakerbox/findings-baseline.json`, and
fails a CI run only when a NEW finding appears — one whose fingerprint isn't in the baseline. A scan
that was clean stays clean; accepted/known findings don't block the build; to accept new findings
you re-baseline with `--update`. Generalizes the cost lockfile (lockfile.py) from a price/ceiling
baseline to a findings baseline. The hard part — a STABLE fingerprint so the same finding maps to
the same id across runs — is `source-file + rule + location`.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

DEFAULT_BASELINE = ".breakerbox/findings-baseline.json"
_SRC_KEYS = ("flow", "config", "spec")  # the source-file key each scanner emits in its --json
_LOC_KEYS = ("server", "node")  # scanner-specific location fields


def _source(f: dict) -> str:
    for k in _SRC_KEYS:
        if k in f:
            return str(f[k])
    return ""


def _location(f: dict) -> str:
    for k in _LOC_KEYS:
        if f.get(k):
            return str(f[k])
    ln = f.get("loop_nodes")  # dow uses a node list as its location
    return ",".join(map(str, ln)) if ln else ""


def fingerprint(f: dict) -> str:
    """A stable id for a finding: source + rule + location. Same finding → same id across runs."""
    basis = f"{_source(f)}|{f.get('rule', '')}|{_location(f)}"
    return hashlib.sha256(basis.encode()).hexdigest()[:16]


def _is_real(f: dict) -> bool:
    """A row counts as a finding only if it carries a real severity (dow emits 'none' for clean)."""
    return str(f.get("severity", "")).lower() not in ("", "none")


def summarize(f: dict) -> str:
    loc = _location(f)
    head = f"[{f.get('severity', '')}] {f.get('rule', '')} — {_source(f)}"
    return head + (f" · {loc}" if loc else "")


def load_findings(text: str) -> list[dict]:
    """Parse the scanners' output: JSONL (one finding per line) or a JSON array. Blanks skipped."""
    text = text.strip()
    if not text:
        return []
    if text[0] == "[":
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


@dataclass
class BaselineResult:
    new: list[dict] = field(default_factory=list)  # fingerprint not in baseline → fail these
    known: list[dict] = field(default_factory=list)  # already accepted in the baseline
    fixed: list[str] = field(default_factory=list)  # baselined fingerprints no longer present


def build_baseline(findings: list[dict]) -> dict:
    fps = {fingerprint(f): summarize(f) for f in findings if _is_real(f)}
    return {"version": 1, "fingerprints": dict(sorted(fps.items()))}


def check_baseline(findings: list[dict], baseline: dict) -> BaselineResult:
    base = set((baseline or {}).get("fingerprints", {}))
    res = BaselineResult()
    seen: set[str] = set()
    for f in findings:
        if not _is_real(f):
            continue
        fp = fingerprint(f)
        seen.add(fp)
        (res.known if fp in base else res.new).append(f)
    res.fixed = sorted(base - seen)
    return res
