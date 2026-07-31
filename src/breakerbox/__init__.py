"""Breakerbox: circuit breaker + hierarchical cost budgeting for agent workflows."""

from breakerbox.guard import (
    BudgetKilled,
    BudgetPaused,
    GracefulStop,
    GuardedApp,
    guard,
    mark_side_effecting,
    mark_untrusted,
)
from breakerbox.ladder import Ladder, LadderAction, Rung, TripDecision
from breakerbox.ledger import InsufficientBudget, Ledger
from breakerbox.pricing import PriceTable, UnknownModelError, cost_microusd

__all__ = [
    "BudgetKilled",
    "BudgetPaused",
    "GracefulStop",
    "GuardedApp",
    "InsufficientBudget",
    "Ladder",
    "LadderAction",
    "Ledger",
    "PriceTable",
    "Rung",
    "TripDecision",
    "UnknownModelError",
    "cost_microusd",
    "guard",
    "mark_side_effecting",
    "mark_untrusted",
]
__version__ = "1.0.0"
