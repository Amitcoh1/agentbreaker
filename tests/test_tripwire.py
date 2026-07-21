from agentbreaker.tripwire import TripReason, Tripwire


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def test_budget_trip():
    tw = Tripwire(budget_micro=1000, max_hops=100)
    assert tw.check(999) is None
    assert tw.check(1000) is TripReason.BUDGET


def test_hops_trip():
    tw = Tripwire(1000, max_hops=3)
    for _ in range(3):
        tw.note_hop()
    assert tw.check(0) is TripReason.HOPS


def test_ttl_trip():
    clock = Clock()
    tw = Tripwire(1000, 100, ttl_seconds=10, time_fn=clock)
    clock.t = 9
    assert tw.check(0) is None
    clock.t = 10
    assert tw.check(0) is TripReason.TTL


def test_velocity_trip_and_window_eviction():
    clock = Clock()
    tw = Tripwire(10_000_000, 100, velocity_micro_per_min=500, time_fn=clock)
    tw.record_spend(300)
    tw.record_spend(300)  # 600 in the trailing 60s > 500/min
    assert tw.check(600) is TripReason.VELOCITY
    clock.t = 61  # both samples now older than the 60s window
    assert tw.check(600) is None


def test_trip_is_sticky_first_reason_wins():
    tw = Tripwire(1000, 100)
    tw.trip(TripReason.BUDGET)
    tw.trip(TripReason.HOPS)
    assert tw.tripped and tw.reason is TripReason.BUDGET


def test_resume_clears_trip_and_raises_budget():
    tw = Tripwire(1000, 100)
    tw.trip(TripReason.BUDGET)
    tw.resume(500)
    assert not tw.tripped
    assert tw.reason is None
    assert tw.budget_micro == 1500
