import threading

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from breakerbox.ledger import InsufficientBudget, Ledger, UnknownAccount


# --- basic reserve / reconcile / release ------------------------------------
def test_reserve_holds_then_reconcile_releases_delta():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    res = ledger.reserve("root", 300)
    assert ledger.remaining("root") == 700
    ledger.reconcile(res, 120)  # actual < estimate -> 180 returned
    assert ledger.remaining("root") == 880
    assert ledger.spent("root") == 120


def test_release_returns_full_hold_no_spend():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    res = ledger.reserve("root", 300)
    ledger.release(res)
    assert ledger.remaining("root") == 1000
    assert ledger.spent("root") == 0


def test_reserve_beyond_remaining_raises():
    ledger = Ledger()
    ledger.open_account("root", None, 100)
    with pytest.raises(InsufficientBudget):
        ledger.reserve("root", 101)


def test_double_settle_raises():
    ledger = Ledger()
    ledger.open_account("root", None, 100)
    res = ledger.reserve("root", 10)
    ledger.reconcile(res, 10)
    with pytest.raises(KeyError):
        ledger.reconcile(res, 10)


def test_unknown_account_raises():
    ledger = Ledger()
    with pytest.raises(UnknownAccount):
        ledger.reserve("ghost", 1)


# --- hierarchy / escrow -----------------------------------------------------
def test_child_allocation_reduces_parent_remaining():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("child", "root", 400)
    assert ledger.remaining("root") == 600
    assert ledger.remaining("child") == 400


def test_child_capped_at_its_allocation_even_if_root_has_room():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("child", "root", 100)
    ledger.reserve("child", 100)
    with pytest.raises(InsufficientBudget):
        ledger.reserve("child", 1)  # child full, though root still has 900 unallocated


def test_open_child_beyond_parent_remaining_raises():
    ledger = Ledger()
    ledger.open_account("root", None, 100)
    with pytest.raises(InsufficientBudget):
        ledger.open_account("child", "root", 101)


# --- top-up policy ----------------------------------------------------------
def test_topup_deny_grants_nothing():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("c", "root", 100)
    assert ledger.request_topup("c", 50, "deny") == 0
    assert ledger.remaining("c") == 100


def test_topup_auto_pulls_from_parent():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("c", "root", 100)
    assert ledger.request_topup("c", 300, "auto") == 300
    assert ledger.remaining("c") == 400
    assert ledger.remaining("root") == 600


def test_topup_auto_clamped_to_available():
    ledger = Ledger()
    ledger.open_account("root", None, 150)
    ledger.open_account("c", "root", 100)
    assert ledger.request_topup("c", 999, "auto") == 50  # only 50 unallocated at root
    assert ledger.remaining("c") == 150


def test_topup_bubbles_through_grandparent():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("mid", "root", 200)  # mid.remaining = 200
    ledger.open_account("leaf", "mid", 50)  # mid.remaining = 150, root.remaining = 800
    assert ledger.request_topup("leaf", 500, "auto") == 500  # 150 + 350 from root
    assert ledger.remaining("leaf") == 550
    assert ledger.total_spent() + ledger.total_reserved() <= ledger.root_allocation()


def test_topup_callable_clamped():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    ledger.open_account("c", "root", 100)
    assert ledger.request_topup("c", 300, lambda n, req, avail: 42) == 42
    assert ledger.remaining("c") == 142


def test_topup_root_cannot_be_topped_up():
    ledger = Ledger()
    ledger.open_account("root", None, 100)
    assert ledger.request_topup("root", 50, "auto") == 0


# --- property: invariant never breached under arbitrary op interleavings -----
@settings(max_examples=300, deadline=None)
@given(
    budget=st.integers(min_value=0, max_value=10_000),
    child_allocs=st.lists(st.integers(min_value=0, max_value=3_000), max_size=5),
    ops=st.lists(
        st.tuples(
            st.integers(min_value=0, max_value=8),  # node index
            st.booleans(),  # True=reserve, False=reconcile
            st.integers(min_value=0, max_value=2_000),  # amount
        ),
        max_size=60,
    ),
)
def test_invariant_never_breached(budget, child_allocs, ops):
    ledger = Ledger()
    ledger.open_account("root", None, budget)
    opened = ["root"]
    for i, alloc in enumerate(child_allocs):
        if alloc <= ledger.remaining("root"):
            ledger.open_account(f"c{i}", "root", alloc)
            opened.append(f"c{i}")

    outstanding = []  # (res_id, estimate)
    for node_idx, is_reserve, amount in ops:
        node = opened[node_idx % len(opened)]
        if is_reserve:
            try:
                res = ledger.reserve(node, amount)
                outstanding.append((res, amount))
            except InsufficientBudget:
                pass
        elif outstanding:
            res, estimate = outstanding.pop()
            ledger.reconcile(res, amount % (estimate + 1))  # actual <= estimate

        # the invariant we exist to guarantee
        assert ledger.total_spent() + ledger.total_reserved() <= ledger.root_allocation()
        for nid in opened:
            assert ledger.remaining(nid) >= 0


# --- real thread concurrency: siblings racing must not overspend ------------
def test_concurrent_siblings_never_overspend():
    ledger = Ledger()
    ledger.open_account("root", None, 1000)
    for i in range(4):
        ledger.open_account(f"c{i}", "root", 250)  # allocations exactly fill root

    errors: list[Exception] = []

    def worker(cid: str) -> None:
        for _ in range(2000):
            try:
                res = ledger.reserve(cid, 1)
                ledger.reconcile(res, 1)
            except InsufficientBudget:
                pass
            except Exception as exc:  # noqa: BLE001 - surface unexpected races
                errors.append(exc)

    threads = [threading.Thread(target=worker, args=(f"c{i}",)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert ledger.total_spent() + ledger.total_reserved() <= ledger.root_allocation()
    for i in range(4):
        assert ledger.spent(f"c{i}") <= 250  # each child capped at its own allocation
