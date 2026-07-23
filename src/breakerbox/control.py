"""Optional live control: poll the cloud for pause/kill commands (Phase 5).

Companion to the report_to sink. A daemon thread polls a control endpoint; when a
command arrives it's stashed on a thread-safe slot that the hop gate reads. This keeps
the "never mid-flight, only at a hop boundary" guarantee — a remote kill is applied at
the next gate, exactly like a local trip. Best-effort: network errors are swallowed.
"""

from __future__ import annotations

import json
import threading
import urllib.parse
import urllib.request

_COMMANDS = ("pause", "kill")


class ControlPoller:
    def __init__(
        self, url: str, run_id: str, key: str | None = None,
        interval: float = 1.5, timeout: float = 4.0,
    ) -> None:
        self.url = url
        self.run_id = run_id
        self.key = key
        self.interval = interval
        self.timeout = timeout
        self._command: str | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    @property
    def command(self) -> str | None:
        with self._lock:
            return self._command

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            cmd = self._poll()
            if cmd in _COMMANDS:
                with self._lock:
                    self._command = cmd
                return  # command captured; the gate will act on it
            if self._stop.wait(self.interval):
                return

    def _poll(self) -> str | None:
        query = urllib.parse.urlencode({"run_id": self.run_id})
        headers = {"x-ingest-key": self.key} if self.key else {}
        req = urllib.request.Request(f"{self.url}?{query}", method="GET", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read() or b"{}")
        except Exception:  # noqa: BLE001 - best-effort; never break the run
            return None
        cmd = data.get("command")
        return cmd if cmd in _COMMANDS else None
