"""Trip conditions + the budget-depletion state (see spec 4.2 / 4.4).

A tripwire never interrupts an in-flight call. It answers two questions:
  - `check()` at a hop boundary: is a hard limit already crossed? (budget/hops/ttl/velocity)
  - after a call reconciles: `record_spend()` feeds the velocity window; a soft
    `check()` can `trip()` so the NEXT hop is gated.

Time is injectable (`time_fn`) so velocity/ttl are deterministic under test.
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from enum import StrEnum

VELOCITY_WINDOW_SECONDS = 60.0


class TripReason(StrEnum):
    BUDGET = "budget"
    HOPS = "hops"
    TTL = "ttl"
    VELOCITY = "velocity"


class Tripwire:
    def __init__(
        self,
        budget_micro: int,
        max_hops: int,
        ttl_seconds: float | None = None,
        velocity_micro_per_min: float | None = None,
        time_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self.budget_micro = budget_micro
        self.max_hops = max_hops
        self.ttl_seconds = ttl_seconds
        self.velocity_micro_per_min = velocity_micro_per_min
        self._time = time_fn
        self.start = time_fn()
        self.hops = 0
        self.tripped = False
        self.reason: TripReason | None = None
        self._window: deque[tuple[float, int]] = deque()

    def note_hop(self) -> None:
        self.hops += 1

    def record_spend(self, micro: int) -> None:
        now = self._time()
        self._window.append((now, micro))
        self._evict(now)

    def _evict(self, now: float) -> None:
        while self._window and now - self._window[0][0] > VELOCITY_WINDOW_SECONDS:
            self._window.popleft()

    def velocity_now(self) -> float:
        # spend inside the trailing 60s window == the per-minute rate (micro/min)
        now = self._time()
        self._evict(now)
        return float(sum(m for _, m in self._window))

    def trip(self, reason: TripReason) -> None:
        if not self.tripped:
            self.tripped = True
            self.reason = reason

    def check(self, spent_micro: int) -> TripReason | None:
        """Return the first crossed limit, or None. Pure (does not mutate)."""
        if spent_micro >= self.budget_micro:
            return TripReason.BUDGET
        if self.hops >= self.max_hops:
            return TripReason.HOPS
        if self.ttl_seconds is not None and self._time() - self.start >= self.ttl_seconds:
            return TripReason.TTL
        if self.velocity_micro_per_min is not None:
            if self.velocity_now() > self.velocity_micro_per_min:
                return TripReason.VELOCITY
        return None

    def resume(self, extra_micro: int) -> None:
        self.budget_micro += extra_micro
        self.tripped = False
        self.reason = None
        self._window.clear()
