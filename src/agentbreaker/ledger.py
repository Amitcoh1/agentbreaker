"""Hierarchical budget ledger with credit-card-hold accounting.

Model: reserve -> execute -> reconcile.
  reserve(estimate)  -> hold an upper bound before dispatch (raises if it won't fit)
  reconcile(actual)  -> record real spend, release the (estimate - actual) hold
  release()          -> drop a hold with no spend (call failed/cancelled)

Hierarchy (see spec 4.3): a node's allocation covers its own spend AND the
allocations it hands to children. So:

    remaining = allocation - spent - reserved - Σ(child allocations)

open_account/reserve enforce remaining >= 0 at every node. That local invariant
telescopes to the global one (child allocations cancel against parent terms):

    Σ spent + Σ reserved <= root allocation, always.

Everything is in microdollars (int). Concurrency: one lock, sync API — see DECISIONS.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, NewType

ReservationId = NewType("ReservationId", int)

# "deny" -> grant nothing; "auto" -> grant up to what ancestors can spare;
# callable(node_id, requested, available) -> granted (clamped to available).
TopupPolicy = Literal["deny", "auto"] | Callable[[str, int, int], int]


class InsufficientBudget(Exception):
    def __init__(self, node_id: str, requested: int, available: int) -> None:
        self.node_id = node_id
        self.requested = requested
        self.available = available
        super().__init__(
            f"node {node_id!r}: need {requested} microUSD but only {available} available"
        )


class UnknownAccount(KeyError):
    pass


@dataclass
class NodeAccount:
    node_id: str
    parent_id: str | None
    allocation_microusd: int
    spent_microusd: int = 0
    reserved_microusd: int = 0
    child_alloc_microusd: int = 0  # Σ allocations handed to direct children

    def remaining(self) -> int:
        return (
            self.allocation_microusd
            - self.spent_microusd
            - self.reserved_microusd
            - self.child_alloc_microusd
        )


class Ledger:
    # ponytail: one global lock; critical sections are tiny and non-blocking.
    # Split to per-account locks only if profiling shows contention.
    def __init__(self) -> None:
        self._accounts: dict[str, NodeAccount] = {}
        self._reservations: dict[int, tuple[str, int]] = {}  # res_id -> (node_id, estimate)
        self._next_res_id = 1
        self._root_id: str | None = None
        self._lock = threading.Lock()

    # ---- accounts / hierarchy ----
    def open_account(
        self, node_id: str, parent_id: str | None, allocation_microusd: int
    ) -> None:
        if allocation_microusd < 0:
            raise ValueError("allocation must be >= 0")
        with self._lock:
            if node_id in self._accounts:
                raise ValueError(f"account {node_id!r} already open")
            if parent_id is None:
                if self._root_id is not None:
                    raise ValueError("root account already exists")
                self._root_id = node_id
            else:
                parent = self._require(parent_id)
                if parent.remaining() < allocation_microusd:
                    raise InsufficientBudget(
                        parent_id, allocation_microusd, parent.remaining()
                    )
                parent.child_alloc_microusd += allocation_microusd
            self._accounts[node_id] = NodeAccount(node_id, parent_id, allocation_microusd)

    def _require(self, node_id: str) -> NodeAccount:
        acc = self._accounts.get(node_id)
        if acc is None:
            raise UnknownAccount(node_id)
        return acc

    # ---- reserve / reconcile / release ----
    def reserve(self, node_id: str, estimate_microusd: int) -> ReservationId:
        if estimate_microusd < 0:
            raise ValueError("estimate must be >= 0")
        with self._lock:
            acc = self._require(node_id)
            if acc.remaining() < estimate_microusd:
                raise InsufficientBudget(node_id, estimate_microusd, acc.remaining())
            acc.reserved_microusd += estimate_microusd
            res_id = self._next_res_id
            self._next_res_id += 1
            self._reservations[res_id] = (node_id, estimate_microusd)
            return ReservationId(res_id)

    def reconcile(self, res_id: ReservationId, actual_microusd: int) -> None:
        if actual_microusd < 0:
            raise ValueError("actual must be >= 0")
        with self._lock:
            entry = self._reservations.pop(res_id, None)
            if entry is None:
                raise KeyError(f"unknown or already-settled reservation {res_id}")
            node_id, estimate = entry
            acc = self._require(node_id)
            acc.reserved_microusd -= estimate
            # ponytail: record truth even if actual > estimate — under-counting spend is
            # the exact bug we exist to prevent. Callers must reserve an upper bound.
            acc.spent_microusd += actual_microusd

    def release(self, res_id: ReservationId) -> None:
        with self._lock:
            entry = self._reservations.pop(res_id, None)
            if entry is None:
                raise KeyError(f"unknown or already-settled reservation {res_id}")
            node_id, estimate = entry
            self._require(node_id).reserved_microusd -= estimate

    # ---- queries ----
    def remaining(self, node_id: str) -> int:
        with self._lock:
            return self._require(node_id).remaining()

    def spent(self, node_id: str) -> int:
        with self._lock:
            return self._require(node_id).spent_microusd

    def total_spent(self) -> int:
        with self._lock:
            return sum(a.spent_microusd for a in self._accounts.values())

    def total_reserved(self) -> int:
        with self._lock:
            return sum(a.reserved_microusd for a in self._accounts.values())

    def root_allocation(self) -> int:
        with self._lock:
            if self._root_id is None:
                return 0
            return self._accounts[self._root_id].allocation_microusd

    def add_root_budget(self, amount_microusd: int) -> None:
        """Raise the root ceiling — used on resume() to grant extra budget."""
        if amount_microusd < 0:
            raise ValueError("amount must be >= 0")
        with self._lock:
            if self._root_id is None:
                raise UnknownAccount("root")
            self._accounts[self._root_id].allocation_microusd += amount_microusd

    # ---- top-up (bubbles up the ancestor chain per policy) ----
    def request_topup(
        self, node_id: str, amount_microusd: int, policy: TopupPolicy = "deny"
    ) -> int:
        """Try to enlarge node's allocation by pulling slack from its ancestors.

        Returns the granted amount (microUSD), 0 if none. The root cannot be
        topped up (it has no parent to fund it).
        """
        if amount_microusd <= 0:
            return 0
        with self._lock:
            acc = self._require(node_id)
            if acc.parent_id is None:
                return 0
            available = sum(a.remaining() for a in self._ancestors(node_id))
            if policy == "deny":
                return 0
            if policy == "auto":
                grant = min(amount_microusd, available)
            elif callable(policy):
                grant = max(0, min(policy(node_id, amount_microusd, available), available))
            else:
                raise ValueError(f"unknown topup policy {policy!r}")
            if grant > 0:
                self._grant(node_id, grant)
            return grant

    def _ancestors(self, node_id: str) -> list[NodeAccount]:
        chain: list[NodeAccount] = []
        pid = self._require(node_id).parent_id
        while pid is not None:
            parent = self._require(pid)
            chain.append(parent)
            pid = parent.parent_id
        return chain

    def _grant(self, node_id: str, amount: int) -> None:
        # Enlarge node's allocation by `amount`, funding it from the parent; if the
        # parent lacks slack, top the parent up first (recurse toward root). Caller
        # has verified the chain holds enough total slack, so recursion terminates.
        acc = self._require(node_id)
        parent = self._require(acc.parent_id)  # never root here: request_topup guards it
        shortfall = amount - parent.remaining()
        if shortfall > 0:
            self._grant(parent.node_id, shortfall)
        parent.child_alloc_microusd += amount
        acc.allocation_microusd += amount
