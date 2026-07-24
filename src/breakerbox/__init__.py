"""Breakerbox: circuit breaker + hierarchical cost budgeting for agent workflows."""

from breakerbox.guard import (
    BudgetKilled,
    BudgetPaused,
    GuardedApp,
    guard,
    mark_side_effecting,
)
from breakerbox.ledger import InsufficientBudget, Ledger
from breakerbox.pricing import PriceTable, UnknownModelError, cost_microusd

__all__ = [
    "BudgetKilled",
    "BudgetPaused",
    "GuardedApp",
    "InsufficientBudget",
    "Ledger",
    "PriceTable",
    "UnknownModelError",
    "cost_microusd",
    "guard",
    "mark_side_effecting",
]
__version__ = "0.0.1"
