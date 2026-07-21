"""Run event log — one JSON object per line (see spec 9.4).

The HTML/JSON report (Phase 3) is generated ONLY from this event stream, so every
fact the receipt needs must be emitted here.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class RunEvent:
    run_id: str
    seq: int
    ts: str
    type: str  # reserve | reconcile | trip | pause | resume | tool_call | finish
    node: str | None = None
    parent: str | None = None
    model: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    estimate_microusd: int | None = None
    actual_microusd: int | None = None
    cumulative_microusd: int | None = None
    side_effecting: bool = False
    detail: dict = field(default_factory=dict)


class EventLog:
    def __init__(self, run_id: str, path: str | Path) -> None:
        self.run_id = run_id
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._seq = 0
        self.events: list[RunEvent] = []

    def emit(self, type: str, **fields) -> RunEvent:
        ev = RunEvent(
            run_id=self.run_id,
            seq=self._seq,
            ts=datetime.now(UTC).isoformat(),
            type=type,
            **fields,
        )
        self._seq += 1
        self.events.append(ev)
        with self.path.open("a") as f:
            f.write(json.dumps(asdict(ev)) + "\n")
        return ev
