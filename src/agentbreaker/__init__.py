"""AgentBreaker: circuit breaker + hierarchical cost budgeting for agent workflows."""

from agentbreaker.guard import (
    BudgetKilled,
    BudgetPaused,
    GuardedApp,
    guard,
    mark_side_effecting,
)
from agentbreaker.ledger import InsufficientBudget, Ledger
from agentbreaker.pricing import PriceTable, UnknownModelError, cost_microusd

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
