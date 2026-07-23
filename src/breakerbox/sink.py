"""Optional cloud sink: POST run events to a Supabase edge function (Phase 5).

Zero new runtime deps — stdlib urllib on a daemon thread. Fire-and-forget and
best-effort: a failed POST is dropped, never raised, so the cloud tier can never
break a run. The core library stays fully useful with report_to unset.
"""

from __future__ import annotations

import json
import queue
import threading
import urllib.request

_STOP = object()  # sentinel: worker drains, posts the final summary, exits


class HttpEventSink:
    def __init__(
        self, url: str, key: str | None = None, run_id: str | None = None, timeout: float = 5.0
    ) -> None:
        self.url = url
        self.key = key
        self.run_id = run_id
        self.timeout = timeout
        self._q: queue.Queue = queue.Queue()
        self._done = threading.Event()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def emit(self, event: dict) -> None:
        self._q.put(("event", event))

    def finish(self, summary: dict) -> None:
        """Post any pending events plus the final summary, then block briefly."""
        self._q.put((_STOP, summary))
        self._done.wait(timeout=self.timeout + 1.0)

    def _run(self) -> None:
        while True:
            batch = [self._q.get()]
            try:
                while True:
                    batch.append(self._q.get_nowait())
            except queue.Empty:
                pass
            events = [payload for kind, payload in batch if kind == "event"]
            summary = next((payload for kind, payload in batch if kind is _STOP), None)
            self._post(events, summary)
            if summary is not None:
                self._done.set()
                return

    def _post(self, events: list[dict], summary: dict | None) -> None:
        if not events and summary is None:
            return
        body: dict = {"run_id": self.run_id, "events": events}
        if summary is not None:
            body["summary"] = summary
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["x-ingest-key"] = self.key
        req = urllib.request.Request(
            self.url, data=json.dumps(body).encode(), method="POST", headers=headers
        )
        try:
            urllib.request.urlopen(req, timeout=self.timeout).read()
        except Exception:  # noqa: BLE001 - best-effort telemetry, never break the run
            pass
