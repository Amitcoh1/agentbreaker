"""Degradation ladder + explainable trip decisions (#150 · VISION §3.2, §6).

Degrade before you die. Instead of a binary kill, cumulative spend crosses a series of **rungs**,
each prescribing an action — swap to a cheaper model, narrow the toolset, stop cleanly with partial
results, and only *kill* as the last resort. A run that finishes at $9 beats one killed at $50.

This module is pure and framework-agnostic: `guard()` (the langchain-core 0.3 callback) and
`BreakerboxMiddleware` (the langchain 1.x middleware) both drive their enforcement from the same
`Ladder`, and every trip is an explainable `TripDecision` object — not a bare `TripReason`.

What each front-end can enforce differs by architecture, not by policy:
  - middleware `wrap_model_call` can rewrite the request → it enforces MODEL_SWAP / TOOL_NARROW.
  - the guard() callback only observes + aborts → it enforces GRACEFUL_STOP / KILL and records the
    MODEL_SWAP / TOOL_NARROW rungs as advisory directives on the receipt.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum

from breakerbox.tripwire import TripReason


class LadderAction(StrEnum):
    MODEL_SWAP = "model_swap"  # switch subsequent calls to a cheaper model
    TOOL_NARROW = "tool_narrow"  # restrict the toolset (drop expensive / side-effecting tools)
    GRACEFUL_STOP = "graceful_stop"  # stop cleanly, return partial results + explanation
    KILL = "kill"  # hard stop — the last rung


# A heuristic detector is less certain than a hard arithmetic limit; surfaced as `confidence`
# so the Phase 2 policy engine (#156) can weigh trips. Hard limits default to 1.0.
_CONFIDENCE: dict[TripReason, float] = {
    TripReason.LOOP: 0.9,
    TripReason.VELOCITY: 0.95,
}

_ENFORCED_STOP = (LadderAction.GRACEFUL_STOP, LadderAction.KILL)


@dataclass(frozen=True)
class Rung:
    """One step of the ladder: at `threshold` (a fraction of budget) apply `actions`."""

    threshold: float  # fraction of budget; >1.0 is allowed (an overspend rung)
    actions: tuple[LadderAction, ...]
    swap_model: str | None = None  # the cheaper model, required when MODEL_SWAP is present
    keep_tools: tuple[str, ...] | None = None  # TOOL_NARROW allow-list; None => drop all non-kept

    def __post_init__(self) -> None:
        if self.threshold < 0:
            raise ValueError(f"rung threshold must be >= 0, got {self.threshold}")
        if not self.actions:
            raise ValueError("a rung needs at least one action")
        if LadderAction.MODEL_SWAP in self.actions and not self.swap_model:
            raise ValueError("a MODEL_SWAP rung needs swap_model=<cheaper model>")

    def has(self, action: LadderAction) -> bool:
        return action in self.actions

    @property
    def stops_run(self) -> bool:
        """True if this rung ends the run (graceful stop or kill) rather than degrading it."""
        return any(a in _ENFORCED_STOP for a in self.actions)


@dataclass(frozen=True)
class Ladder:
    rungs: tuple[Rung, ...]

    def __post_init__(self) -> None:
        if not self.rungs:
            raise ValueError("a ladder needs at least one rung")
        object.__setattr__(self, "rungs", tuple(sorted(self.rungs, key=lambda r: r.threshold)))

    def rung_for(self, fraction: float) -> Rung | None:
        """The highest rung whose threshold <= `fraction`, or None below the first rung."""
        active: Rung | None = None
        for r in self.rungs:  # sorted ascending
            if fraction >= r.threshold:
                active = r
            else:
                break
        return active

    def index_of(self, rung: Rung | None) -> int | None:
        return None if rung is None else self.rungs.index(rung)

    @classmethod
    def default(cls, swap_model: str = "openai/gpt-4o-mini") -> Ladder:
        """0.80 -> cheaper model + narrowed tools; 1.00 -> graceful stop with partial results.

        Terminal action is graceful_stop, not kill: finishing with partials beats a hard kill.
        Configure a rung with KILL if you want a hard wall.
        """
        return cls(
            rungs=(
                Rung(
                    0.80,
                    (LadderAction.MODEL_SWAP, LadderAction.TOOL_NARROW),
                    swap_model=swap_model,
                ),
                Rung(1.00, (LadderAction.GRACEFUL_STOP,)),
            )
        )


@dataclass
class TripDecision:
    """The explainable trip object (VISION §6) — a trip is this, never a bare boolean/reason."""

    reason: TripReason
    policy: str  # human policy id, e.g. "budget" or "ladder:graceful_stop@1.00"
    threshold: float  # the fraction (of budget) the policy fires at
    counter_value: float  # the observed fraction of budget spent
    ladder_rung: int | None = None  # index of the active rung, if ladder-driven
    action: LadderAction | None = None  # the enforced action
    confidence: float = 1.0
    override_url: str | None = None  # where a human can override this trip (control plane)
    spent_micro: int | None = None
    budget_micro: int | None = None

    def to_dict(self) -> dict:
        return {
            "policy": self.policy,
            "threshold": self.threshold,
            "counter_value": self.counter_value,
            "confidence": self.confidence,
            "ladder_rung": self.ladder_rung,
            "reason": self.reason.value,
            "action": self.action.value if self.action else None,
            "override_url": self.override_url,
            "spent_micro": self.spent_micro,
            "budget_micro": self.budget_micro,
        }

    def to_json(self) -> str:
        """Stable, deterministic JSON (sorted keys) — safe to snapshot / diff / ship."""
        return json.dumps(self.to_dict(), sort_keys=True)


def budget_decision(
    reason: TripReason,
    spent_micro: int,
    budget_micro: int,
    ladder: Ladder | None = None,
    action: LadderAction | None = None,
    override_url: str | None = None,
) -> TripDecision:
    """Build the explainable decision for a budget-family trip, tying in the active ladder rung."""
    frac = spent_micro / budget_micro if budget_micro else 0.0
    rung = ladder.rung_for(frac) if ladder else None
    if action is None and rung is not None:
        # the terminal (most severe) action of the active rung
        action = rung.actions[-1]
    threshold = rung.threshold if rung is not None else 1.0
    policy = f"ladder:{action.value}@{threshold:.2f}" if action is not None else reason.value
    return TripDecision(
        reason=reason,
        policy=policy,
        threshold=threshold,
        counter_value=round(frac, 6),
        ladder_rung=ladder.index_of(rung) if ladder else None,
        action=action,
        confidence=_CONFIDENCE.get(reason, 1.0),
        override_url=override_url,
        spent_micro=spent_micro,
        budget_micro=budget_micro,
    )
