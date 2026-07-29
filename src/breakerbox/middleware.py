"""BreakerboxMiddleware (#146) — the LangChain 1.x agent-middleware front-end for guard().

Mounts Breakerbox's dollar-budget enforcement where modern agents actually live —
`create_agent` / `create_deep_agent` / a LangGraph Server graph — via the 1.x `AgentMiddleware`
hooks, instead of the langchain-core 0.3 callback that `guard()` uses. Same `PriceTable`, same
`TripReason`; a different attach point.

Requires `langchain>=1` (`pip install 'breakerbox[langchain1]'`). This module is import-guarded and
imported opt-in, so it never touches the 0.3 callback path — the two front-ends share one core.

Phase 1 (this file): budget + max_hops trip at the hop boundary — priced from each call's
`usage_metadata`, tripped in `before_model` by jumping to the graph end. Escrow / sub-budgets /
semantic loop detection / capability_lock / receipts layer on in Phase 2 (see #146).
"""

from __future__ import annotations

from typing import Any

from breakerbox.pricing import MICRO_PER_USD, PriceTable
from breakerbox.tripwire import TripReason

try:
    from typing import Annotated, NotRequired

    from langchain.agents.middleware import AgentMiddleware, AgentState, hook_config
    from langchain.agents.middleware.types import PrivateStateAttr
    from langchain_core.messages import AIMessage
    from langgraph.channels.untracked_value import UntrackedValue
except ImportError as e:  # pragma: no cover - only hit without the extra installed
    raise ImportError(
        "BreakerboxMiddleware needs LangChain 1.x — install `breakerbox[langchain1]` "
        "(or `pip install 'langchain>=1'`). For langchain-core 0.3, use guard() instead."
    ) from e


class BudgetTripped(Exception):
    """Raised when exit_behavior='error' and the budget/hop cap is crossed."""

    def __init__(self, reason: str, spent_usd: float) -> None:
        self.reason = reason
        self.spent_usd = spent_usd
        super().__init__(f"breakerbox: budget tripped ({reason}) at ${spent_usd:.4f}")


# Per-run budget counters: private (kept out of the agent's input/output schema) and untracked
# (reset each invocation), mirroring how ModelCallLimitMiddleware scopes its run-level counter.
class BreakerboxState(AgentState):
    bbx_spent_micro: NotRequired[Annotated[int, UntrackedValue, PrivateStateAttr]]
    bbx_hops: NotRequired[Annotated[int, UntrackedValue, PrivateStateAttr]]
    bbx_trip: NotRequired[Annotated[str | None, UntrackedValue, PrivateStateAttr]]


def _to_micro(usd: float) -> int:
    return round(usd * 1_000_000)


def _usd(v: float) -> str:
    return f"${v:.2f}" if abs(v) >= 1 else f"${v:.4f}"


def _last_ai(messages: list) -> AIMessage | None:
    for m in reversed(messages or []):
        if isinstance(m, AIMessage):
            return m
    return None


def _model_of(msg: AIMessage, default: str) -> str:
    rm = getattr(msg, "response_metadata", None) or {}
    return rm.get("model_name") or rm.get("model") or default


class BreakerboxMiddleware(AgentMiddleware):
    """Enforce a hard dollar budget on a LangChain 1.x agent. Mirrors `guard(budget_usd=...)`.

    ```python
    from langchain.agents import create_agent
    from breakerbox.middleware import BreakerboxMiddleware

    agent = create_agent(model, tools, middleware=[BreakerboxMiddleware(budget_usd=5.00)])
    ```

    The gate runs in `before_model`: once cumulative spend crosses the budget (or hops cross
    max_hops), the next model call is blocked by jumping to the graph end and appending a notice
    message. Cost is reconciled in `after_model` from the call's `usage_metadata`.
    """

    state_schema = BreakerboxState

    def __init__(
        self,
        *,
        budget_usd: float,
        max_hops: int = 100,
        model: str = "openai/gpt-4o",
        unknown_model: str = "default_rate",
        exit_behavior: str = "end",
    ) -> None:
        super().__init__()
        if budget_usd <= 0:
            raise ValueError("budget_usd must be > 0")
        if exit_behavior not in ("end", "error"):
            raise ValueError("exit_behavior must be 'end' or 'error'")
        self.budget_micro = _to_micro(budget_usd)
        self.max_hops = max_hops
        self.default_model = model
        self.exit_behavior = exit_behavior
        self.prices = PriceTable.load(unknown_model=unknown_model)

    # ---- gate: runs before each model call ----
    @hook_config(can_jump_to=["end"])
    def before_model(self, state: BreakerboxState, runtime: Any) -> dict[str, Any] | None:
        spent = state.get("bbx_spent_micro", 0)
        hops = state.get("bbx_hops", 0)
        reason: TripReason | None = None
        if spent >= self.budget_micro:
            reason = TripReason.BUDGET
        elif hops >= self.max_hops:
            reason = TripReason.HOPS
        if reason is None:
            return None
        spent_usd = spent / MICRO_PER_USD
        if self.exit_behavior == "error":
            raise BudgetTripped(reason.value, spent_usd)
        cap = _usd(self.budget_micro / MICRO_PER_USD)
        notice = (
            f"⏻ breakerbox: tripped ({reason.value}) — spent {_usd(spent_usd)} of {cap} "
            f"over {hops} hop(s). Next model call blocked."
        )
        return {"jump_to": "end", "messages": [AIMessage(content=notice)], "bbx_trip": reason.value}

    async def abefore_model(self, state: BreakerboxState, runtime: Any) -> dict[str, Any] | None:
        return self.before_model(state, runtime)

    # ---- reconcile: runs after each model call ----
    def after_model(self, state: BreakerboxState, runtime: Any) -> dict[str, Any] | None:
        cost = 0
        msg = _last_ai(state.get("messages", []))
        um = getattr(msg, "usage_metadata", None) if msg is not None else None
        if um:
            try:
                cost = self.prices.cost_microusd(
                    _model_of(msg, self.default_model),
                    int(um.get("input_tokens") or 0),
                    int(um.get("output_tokens") or 0),
                )
            except Exception:  # noqa: BLE001 - never crash a run on a pricing edge case
                cost = 0
        return {
            "bbx_spent_micro": state.get("bbx_spent_micro", 0) + cost,
            "bbx_hops": state.get("bbx_hops", 0) + 1,
        }

    async def aafter_model(self, state: BreakerboxState, runtime: Any) -> dict[str, Any] | None:
        return self.after_model(state, runtime)
