"""guard(): wrap a compiled LangGraph app with in-process budget enforcement.

Interception is via a LangChain callback handler injected into the run config.
Callbacks propagate down the whole run tree (nodes, sub-agents, subgraphs) through
langchain-core's context, so a single handler meters everything with no per-node
wiring — this is why the library beats a proxy for this scope (spec 8).

Enforcement is at the hop boundary: the gate runs at the START of each model/tool
call. An in-flight call is never interrupted. A velocity/soft trip detected at
reconcile time is applied at the NEXT gate.

Trip actions:
  - kill  -> stop, finalize report, raise BudgetKilled (lists side-effecting tools fired)
  - pause -> the checkpointer already saved the last good superstep; raise BudgetPaused,
             resume() tops up budget and re-invokes from that checkpoint
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from langchain_core.callbacks import BaseCallbackHandler

from agentbreaker.control import ControlPoller
from agentbreaker.events import EventLog
from agentbreaker.ledger import InsufficientBudget, Ledger, ReservationId
from agentbreaker.meter import (
    DEFAULT_MAX_OUTPUT_TOKENS,
    StreamMeter,
    count_message_tokens,
    count_text_tokens,
    reconcile_usage,
)
from agentbreaker.pricing import PriceTable
from agentbreaker.report.generate import render_terminal, write_report
from agentbreaker.sink import HttpEventSink
from agentbreaker.tripwire import TripReason, Tripwire

_ROOT = "root"


def _to_micro(usd: float) -> int:
    return round(usd * 1_000_000)


class BudgetPaused(Exception):
    def __init__(
        self, checkpoint_id: str, spent_usd: float, reason: str, report_path: Path
    ) -> None:
        self.checkpoint_id = checkpoint_id
        self.spent_usd = spent_usd
        self.reason = reason
        self.report_path = report_path
        super().__init__(
            f"budget paused ({reason}): spent ${spent_usd:.4f}; "
            f"resume with checkpoint_id={checkpoint_id!r}"
        )


class BudgetKilled(Exception):
    def __init__(
        self, spent_usd: float, reason: str, report_path: Path, side_effects_fired: list[str]
    ) -> None:
        self.spent_usd = spent_usd
        self.reason = reason
        self.report_path = report_path
        self.side_effects_fired = side_effects_fired
        super().__init__(
            f"budget killed ({reason}): spent ${spent_usd:.4f}; "
            f"side-effecting tools fired: {side_effects_fired or 'none'}"
        )


class _Trip(Exception):
    """Internal control signal raised at the gate; caught by GuardedApp."""

    def __init__(self, reason: TripReason) -> None:
        self.reason = reason


@dataclass
class _Call:
    res_id: ReservationId
    account: str
    node: str
    model: str
    tokens_in: int
    estimate: int
    declared_max: bool  # did the call declare max_tokens? (else the reserve may under-count)
    stream: StreamMeter


@dataclass
class _Run:
    run_id: str
    ledger: Ledger
    tripwire: Tripwire
    eventlog: EventLog
    handler: BaseCallbackHandler = None  # set after construction
    thread_id: str | None = None
    config: dict | None = None
    report_path: Path | None = None
    sink: HttpEventSink | None = None
    control: ControlPoller | None = None
    remote_action: str | None = None  # "pause" | "kill" from the dashboard
    calls: dict[str, _Call] = field(default_factory=dict)
    side_effect_fired: list[str] = field(default_factory=list)


def _model_name(serialized: dict | None, metadata: dict | None) -> str:
    md = metadata or {}
    provider, name = md.get("ls_provider"), md.get("ls_model_name")
    if name and "/" in name:
        return name
    if provider and name:
        return f"{provider}/{name}"
    if name:
        return name
    kwargs = (serialized or {}).get("kwargs") or {}
    m = kwargs.get("model") or kwargs.get("model_name")
    return m or "unknown/unknown"


def _extract_usage(response) -> tuple[int | None, int | None]:
    try:
        message = response.generations[0][0].message
        um = getattr(message, "usage_metadata", None)
        if um:
            return um.get("input_tokens"), um.get("output_tokens")
    except (AttributeError, IndexError, TypeError):
        pass
    out = getattr(response, "llm_output", None) or {}
    usage = out.get("token_usage") or out.get("usage") or {}
    return usage.get("prompt_tokens"), usage.get("completion_tokens")


def _response_text(response) -> str:
    try:
        return response.generations[0][0].text or ""
    except (AttributeError, IndexError, TypeError):
        return ""


class _BudgetHandler(BaseCallbackHandler):
    # raise_error=True makes our gate's _Trip propagate out of the model call
    # instead of being swallowed by the callback manager.
    raise_error = True

    def __init__(self, guard: GuardedApp, run: _Run) -> None:
        self._g = guard
        self._run = run

    # ---- gate (runs before every model/tool hop) ----
    def _gate(self) -> None:
        tw = self._run.tripwire
        if self._run.control is not None and not tw.tripped:
            cmd = self._run.control.command
            if cmd:
                self._run.remote_action = cmd
                self._run.eventlog.emit("control", detail={"command": cmd})
                tw.trip(TripReason.REMOTE)
        if tw.tripped:
            self._trip(tw.reason)
        if tw.hops >= tw.max_hops:
            tw.trip(TripReason.HOPS)
            self._trip(TripReason.HOPS)
        reason = tw.check(self._run.ledger.total_spent())
        if reason in (TripReason.TTL,):  # time-based limit, safe to enforce here
            tw.trip(reason)
            self._trip(reason)

    def _trip(self, reason: TripReason) -> None:
        self._run.eventlog.emit(
            "trip",
            cumulative_microusd=self._run.ledger.total_spent(),
            detail={"reason": reason.value, "on_trip": self._g.on_trip},
        )
        raise _Trip(reason)

    # ---- model calls ----
    def on_chat_model_start(self, serialized, messages, *, run_id, parent_run_id=None,
                            tags=None, metadata=None, **kwargs):
        flat = [m for batch in messages for m in batch]
        self._start_call(str(run_id), str(parent_run_id) if parent_run_id else None,
                         flat, serialized, metadata, kwargs)

    def on_llm_start(self, serialized, prompts, *, run_id, parent_run_id=None,
                     tags=None, metadata=None, **kwargs):
        self._start_call(str(run_id), str(parent_run_id) if parent_run_id else None,
                         list(prompts), serialized, metadata, kwargs)

    def _start_call(self, run_id, parent, messages, serialized, metadata, kwargs):
        self._gate()
        node = (metadata or {}).get("langgraph_node") or _ROOT
        model = _model_name(serialized, metadata)
        tokens_in = count_message_tokens(messages, model)
        inv = kwargs.get("invocation_params") or {}
        declared_max = inv.get("max_tokens") is not None
        max_out = inv.get("max_tokens") or DEFAULT_MAX_OUTPUT_TOKENS
        # cost_microusd may raise UnknownModelError here — i.e. before dispatch, never $0
        estimate = self._g.prices.cost_microusd(model, tokens_in, max_out)
        account = node if node in self._g.sub_budgets else _ROOT
        res = self._reserve_or_trip(account, estimate)
        self._run.tripwire.note_hop()
        self._run.calls[run_id] = _Call(res, account, node, model, tokens_in, estimate,
                                         declared_max, StreamMeter(model))
        led = self._run.ledger
        self._run.eventlog.emit(
            "reserve", node=node, parent=parent, model=model, tokens_in=tokens_in,
            estimate_microusd=estimate,
            cumulative_microusd=led.total_spent() + led.total_reserved(),
        )

    def _reserve_or_trip(self, account, estimate) -> ReservationId:
        led = self._run.ledger
        try:
            return led.reserve(account, estimate)
        except InsufficientBudget:
            if account != _ROOT:
                need = estimate - led.remaining(account)
                if led.request_topup(account, need, self._g.topup_policy):
                    try:
                        return led.reserve(account, estimate)
                    except InsufficientBudget:
                        pass
            self._run.tripwire.trip(TripReason.BUDGET)
            self._trip(TripReason.BUDGET)

    def on_llm_new_token(self, token, *, run_id, **kwargs):
        call = self._run.calls.get(str(run_id))
        if call:
            call.stream.add_chunk(token)

    def on_llm_end(self, response, *, run_id, **kwargs):
        call = self._run.calls.pop(str(run_id), None)
        if call is None:
            return
        try:
            prov_in, prov_out = _extract_usage(response)
        except Exception:  # noqa: BLE001 - never crash a run on provider-response parsing
            prov_in = prov_out = None
        local_out = call.stream.tokens or count_text_tokens(_response_text(response), call.model)
        final_in, final_out, flags = reconcile_usage(call.tokens_in, local_out, prov_in, prov_out)
        actual = self._g.prices.cost_microusd(call.model, final_in, final_out)
        led = self._run.ledger
        led.reconcile(call.res_id, actual)
        tw = self._run.tripwire
        tw.record_spend(actual)
        detail: dict = {"discrepancy": flags} if flags else {}
        # Cap enforced a hop late: the call declared no max_tokens, so the reserve under-counted
        # and the real cost exceeded it — the receipt flags this so the number isn't a surprise.
        if actual > call.estimate and not call.declared_max:
            detail["overshoot"] = {"estimate_microusd": call.estimate, "actual_microusd": actual}
        self._run.eventlog.emit(
            "reconcile", node=call.node, model=call.model, tokens_in=final_in,
            tokens_out=final_out, estimate_microusd=call.estimate, actual_microusd=actual,
            cumulative_microusd=led.total_spent(), detail=detail,
        )
        # soft check: velocity/budget crossed -> mark tripped, enforced at NEXT gate
        reason = tw.check(led.total_spent())
        if reason:
            tw.trip(reason)

    def on_llm_error(self, error, *, run_id, **kwargs):
        call = self._run.calls.pop(str(run_id), None)
        if call:
            self._run.ledger.release(call.res_id)

    # ---- tools ----
    def on_tool_start(self, serialized, input_str, *, run_id, parent_run_id=None,
                      tags=None, metadata=None, **kwargs):
        self._gate()
        name = (serialized or {}).get("name") or "tool"
        side = "side_effecting" in (tags or []) or bool((metadata or {}).get("side_effecting"))
        self._run.tripwire.note_hop()
        if side:
            self._run.side_effect_fired.append(name)
        self._run.eventlog.emit(
            "tool_call", node=name, side_effecting=side,
            cumulative_microusd=self._run.ledger.total_spent(),
        )


def mark_side_effecting(tool):
    """Tag a LangChain tool so the receipt flags it when it fires before a trip."""
    tags = list(getattr(tool, "tags", None) or [])
    if "side_effecting" not in tags:
        tags.append("side_effecting")
    tool.tags = tags
    return tool


class GuardedApp:
    def __init__(
        self,
        app,
        budget_usd: float,
        max_hops: int,
        ttl_seconds: int | None,
        velocity_usd_per_min: float | None,
        on_trip: Literal["pause", "kill"],
        sub_budgets: dict[str, float] | None,
        topup_policy,
        unknown_model: Literal["fail", "default_rate"],
        report_dir: str | Path,
        report_to: str | None,
    ) -> None:
        if on_trip not in ("pause", "kill"):
            raise ValueError(f"on_trip must be pause|kill, got {on_trip!r}")
        if on_trip == "pause" and getattr(app, "checkpointer", None) is None:
            raise ValueError(
                "on_trip='pause' needs the app compiled with a checkpointer "
                "(e.g. compile(checkpointer=MemorySaver()))"
            )

        self.app = app
        self.budget_micro = _to_micro(budget_usd)
        self.max_hops = max_hops
        self.ttl_seconds = ttl_seconds
        self.velocity_micro_per_min = (
            _to_micro(velocity_usd_per_min) if velocity_usd_per_min is not None else None
        )
        self.on_trip = on_trip
        self.sub_budgets = sub_budgets or {}
        self.topup_policy = topup_policy
        self.prices = PriceTable.load(unknown_model=unknown_model)
        self.report_dir = Path(report_dir)
        self.report_to = report_to
        # Live-control endpoint: env override, else derive from report_to (/ingest -> /control)
        self._control_url = os.getenv("AGENTBREAKER_CONTROL_URL")
        if not self._control_url and report_to and "/" in report_to:
            self._control_url = f"{report_to.rsplit('/', 1)[0]}/control"
        self._runs: dict[str, _Run] = {}
        self._resumable: dict[str, _Run] = {}
        self.last_report_path: Path | None = None

    # ---- public API ----
    def invoke(self, *args, **kwargs):
        return self._run_guarded(self.app.invoke, args, kwargs)

    async def ainvoke(self, *args, **kwargs):
        run, args, kwargs = self._prepare(args, kwargs)
        try:
            result = await self.app.ainvoke(*args, **kwargs)
        except _Trip as trip:
            return self._handle_trip(run, trip.reason)
        return self._finish(run, result)

    def resume(self, checkpoint_id: str, extra_budget_usd: float):
        run = self._resumable.pop(checkpoint_id, None)
        if run is None:
            raise KeyError(f"no paused run for checkpoint_id={checkpoint_id!r}")
        extra = _to_micro(extra_budget_usd)
        run.ledger.add_root_budget(extra)
        run.tripwire.resume(extra)
        run.eventlog.emit("resume", detail={"extra_usd": extra_budget_usd})
        try:
            result = self.app.invoke(None, run.config)
        except _Trip as trip:
            return self._handle_trip(run, trip.reason)
        return self._finish(run, result)

    # ---- internals ----
    def _run_guarded(self, fn, args, kwargs):
        run, args, kwargs = self._prepare(args, kwargs)
        try:
            result = fn(*args, **kwargs)
        except _Trip as trip:
            return self._handle_trip(run, trip.reason)
        return self._finish(run, result)

    def _finish(self, run: _Run, result):
        run.eventlog.emit("finish", cumulative_microusd=run.ledger.total_spent())
        self._finalize(run)
        return result

    def _finalize(self, run: _Run) -> Path:
        if run.control is not None:
            run.control.stop()
        html_path, summary = write_report(run.run_id, run.eventlog.path, self.report_dir)
        run.report_path = html_path
        self.last_report_path = html_path
        if run.sink is not None:
            run.sink.finish(summary)
        print(render_terminal(summary))
        return html_path

    def _prepare(self, args, kwargs):
        run = self._start_run()
        # config is the 2nd positional arg or the `config` kwarg
        config = kwargs.get("config")
        if config is None and len(args) >= 2:
            config = args[1]
        config, thread_id = self._prep_config(config, run)
        run.thread_id, run.config = thread_id, config
        self._runs[thread_id] = run
        if "config" in kwargs or len(args) < 2:
            kwargs["config"] = config
        else:
            args = (args[0], config, *args[2:])
        return run, args, kwargs

    def _start_run(self) -> _Run:
        run_id = uuid.uuid4().hex
        ledger = Ledger()
        ledger.open_account(_ROOT, None, self.budget_micro)
        for name, usd in self.sub_budgets.items():
            ledger.open_account(name, _ROOT, _to_micro(usd))
        tripwire = Tripwire(
            self.budget_micro, self.max_hops, self.ttl_seconds, self.velocity_micro_per_min
        )
        sink = None
        if self.report_to:
            sink = HttpEventSink(
                self.report_to, key=os.getenv("AGENTBREAKER_INGEST_KEY"), run_id=run_id
            )
        eventlog = EventLog(
            run_id,
            self.report_dir / f"{run_id}.jsonl",
            sink=sink.emit if sink else None,
        )
        eventlog.emit(
            "start",
            detail={
                "budget_micro": self.budget_micro,
                "max_hops": self.max_hops,
                "ttl_seconds": self.ttl_seconds,
                "velocity_micro_per_min": self.velocity_micro_per_min,
                "on_trip": self.on_trip,
                "sub_budgets": {k: _to_micro(v) for k, v in self.sub_budgets.items()},
            },
        )
        control = None
        if self.report_to and self._control_url:
            control = ControlPoller(
                self._control_url, run_id, key=os.getenv("AGENTBREAKER_INGEST_KEY")
            )
        run = _Run(run_id, ledger, tripwire, eventlog, sink=sink, control=control)
        run.handler = _BudgetHandler(self, run)
        return run

    def _prep_config(self, config, run) -> tuple[dict, str]:
        config = dict(config or {})
        configurable = dict(config.get("configurable") or {})
        configurable.setdefault("thread_id", uuid.uuid4().hex)
        config["configurable"] = configurable
        cbs = config.get("callbacks")
        if cbs is None or isinstance(cbs, list):
            config["callbacks"] = [*(cbs or []), run.handler]
        else:  # a callback manager
            cbs.add_handler(run.handler)
            config["callbacks"] = cbs
        return config, configurable["thread_id"]

    def _handle_trip(self, run: _Run, reason: TripReason):
        spent_usd = run.ledger.total_spent() / 1_000_000
        # A remote command's action (pause|kill) overrides the configured on_trip.
        action = run.remote_action or self.on_trip
        if action == "pause" and getattr(self.app, "checkpointer", None) is None:
            action = "kill"  # can't preserve state without a checkpointer
        if action == "kill":
            report_path = self._finalize(run)
            raise BudgetKilled(spent_usd, reason.value, report_path, list(run.side_effect_fired))
        checkpoint_id = self._checkpoint_id(run.config)
        run.eventlog.emit(
            "pause", cumulative_microusd=run.ledger.total_spent(),
            detail={"reason": reason.value, "checkpoint_id": checkpoint_id},
        )
        report_path = self._finalize(run)
        self._resumable[checkpoint_id] = run
        raise BudgetPaused(checkpoint_id, spent_usd, reason.value, report_path)

    def _checkpoint_id(self, config) -> str:
        state = self.app.get_state(config)
        return state.config["configurable"]["checkpoint_id"]


def guard(
    app,
    budget_usd: float,
    max_hops: int = 100,
    ttl_seconds: int | None = None,
    velocity_usd_per_min: float | None = None,
    on_trip: Literal["pause", "kill"] = "pause",
    sub_budgets: dict[str, float] | None = None,
    topup_policy: Literal["deny", "auto"] | Callable = "deny",
    unknown_model: Literal["fail", "default_rate"] = "fail",
    report_dir: str | Path = "./agentbreaker_reports",
    report_to: str | None = None,
) -> GuardedApp:
    return GuardedApp(
        app, budget_usd, max_hops, ttl_seconds, velocity_usd_per_min, on_trip,
        sub_budgets, topup_policy, unknown_model, report_dir, report_to,
    )
