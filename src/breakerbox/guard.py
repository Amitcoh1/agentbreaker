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
import sys
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from langchain_core.callbacks import BaseCallbackHandler

from breakerbox.control import ControlPoller
from breakerbox.events import EventLog
from breakerbox.ledger import InsufficientBudget, Ledger, ReservationId
from breakerbox.loopdetect import LoopDetector, make_detector
from breakerbox.meter import (
    DEFAULT_MAX_OUTPUT_TOKENS,
    StreamMeter,
    count_message_tokens,
    count_text_tokens,
    reconcile_usage,
)
from breakerbox.pricing import PriceTable
from breakerbox.report.generate import render_terminal, write_report
from breakerbox.sink import HttpEventSink
from breakerbox.tripwire import TripReason, Tripwire

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
    span: object | None = None  # OTel span for this hop, when otel=True


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
    loop: LoopDetector | None = None  # #82 semantic loop detector, when detect_loops is on
    alerted: set[float] = field(default_factory=set)  # #90 budget thresholds already warned
    calls: dict[str, _Call] = field(default_factory=dict)
    side_effect_fired: list[str] = field(default_factory=list)
    otel_run_span: object | None = None  # parent run span, when otel=True


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


def _call_text(messages) -> str:
    """The input of a hop as plain text (messages or prompts) — the loop-detector signature."""
    parts = []
    for m in messages:
        c = getattr(m, "content", m)
        parts.append(c if isinstance(c, str) else str(c))
    return "\n".join(parts)


def _call_depth(metadata) -> int:
    """Sub-agent nesting depth of a hop from LangGraph's checkpoint namespace (1 = top level)."""
    ns = (metadata or {}).get("langgraph_checkpoint_ns") or ""
    return ns.count("|") + 1 if ns else 1


_DEFAULT_ALERT_THRESHOLDS = (0.5, 0.8, 0.95)


def _parse_alerts(alerts) -> tuple[list[float], object]:
    """Resolve the `alerts` config (#90) to (sorted thresholds, callback|None). Off → ([], None)."""
    if not alerts:
        return [], None
    if alerts is True:
        return list(_DEFAULT_ALERT_THRESHOLDS), None
    if callable(alerts):
        return list(_DEFAULT_ALERT_THRESHOLDS), alerts
    thresholds = alerts.get("thresholds", _DEFAULT_ALERT_THRESHOLDS)
    for t in thresholds:
        if not 0.0 < t <= 1.0:
            raise ValueError(f"alert threshold must be in (0, 1], got {t}")
    return sorted(thresholds), alerts.get("on_alert")


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

    def _emit_live(self) -> None:
        """#83: a live $-spent / budget line (or callback) after each hop reconciles. No server."""
        live = self._g.live
        if not live:
            return
        spent = self._run.ledger.total_spent() / 1_000_000
        budget = self._g.budget_micro / 1_000_000
        hops = self._run.tripwire.hops
        if callable(live):
            live({"spent_usd": spent, "budget_usd": budget, "hops": hops})
            return
        pct = f"{spent / budget * 100:.0f}%" if budget else "—"
        hop_word = "hop" if hops == 1 else "hops"
        line = f"[breakerbox] ${spent:.4f} / ${budget:.2f} ({pct}) · {hops} {hop_word}"
        if sys.stderr.isatty():
            print(f"\r{line}\033[K", end="", file=sys.stderr, flush=True)
        else:
            print(line, file=sys.stderr, flush=True)

    def _check_alerts(self) -> None:
        """#90: fire a warn callback/log as spend crosses each budget threshold — once each."""
        thresholds = self._g._alert_thresholds
        budget = self._g.budget_micro
        if not thresholds or budget <= 0:
            return
        frac = self._run.ledger.total_spent() / budget
        for t in thresholds:
            if frac >= t and t not in self._run.alerted:
                self._run.alerted.add(t)
                payload = {
                    "threshold": t,
                    "pct": round(frac * 100, 1),
                    "spent_usd": self._run.ledger.total_spent() / 1_000_000,
                    "budget_usd": budget / 1_000_000,
                }
                self._run.eventlog.emit("alert", detail=payload)
                if self._g._alert_fn is not None:
                    self._g._alert_fn(payload)
                else:
                    print(
                        f"[breakerbox] ⚠ {int(t * 100)}% of budget spent "
                        f"(${payload['spent_usd']:.4f} / ${payload['budget_usd']:.2f})",
                        file=sys.stderr, flush=True,
                    )

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
        # Depth cap: a run that nests sub-agents past max_depth trips before the hop (#84). The
        # check runs in this guard-injected callback, outside any agent-controllable code.
        if self._g.max_depth is not None and _call_depth(metadata) > self._g.max_depth:
            self._run.tripwire.trip(TripReason.DEPTH)
            self._trip(TripReason.DEPTH)
        # Loop check runs before the reserve so a runaway trips without paying for the hop (#82).
        if self._run.loop is not None and self._run.loop.observe(node, _call_text(messages)):
            self._run.tripwire.trip(TripReason.LOOP)
            self._trip(TripReason.LOOP)
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
        call = _Call(res, account, node, model, tokens_in, estimate,
                     declared_max, StreamMeter(model))
        if self._g._otel is not None:
            call.span = self._g._otel.start_hop(self._run.otel_run_span, node, model)
        self._run.calls[run_id] = call
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
        self._emit_live()
        self._check_alerts()
        if call.span is not None:
            self._g._otel.end_hop(call.span, final_in, final_out, actual)
        # soft check: velocity/budget crossed -> mark tripped, enforced at NEXT gate
        reason = tw.check(led.total_spent())
        if reason:
            tw.trip(reason)

    def on_llm_error(self, error, *, run_id, **kwargs):
        call = self._run.calls.pop(str(run_id), None)
        if call:
            self._run.ledger.release(call.res_id)
            if call.span is not None:
                self._g._otel.end_hop(call.span, None, None, 0, error=error)

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
        if self._g._otel is not None:
            self._g._otel.tool_span(self._run.otel_run_span, name, side)


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
        otel: bool,
        detect_loops: bool | dict,
        live: bool | Callable,
        max_depth: int | None,
        alerts: bool | dict | Callable,
        tags: dict | None,
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
        self.detect_loops = detect_loops
        self.live = live
        self.max_depth = max_depth
        self.alerts = alerts
        self._alert_thresholds, self._alert_fn = _parse_alerts(alerts)
        self.tags = {str(k): str(v) for k, v in (tags or {}).items()}  # #85 attribution tags
        # fail fast on a bad loop config at guard()-time, not mid-run
        make_detector(detect_loops)
        self.sub_budgets = sub_budgets or {}
        self.topup_policy = topup_policy
        self.prices = PriceTable.load(unknown_model=unknown_model)
        self.report_dir = Path(report_dir)
        self.report_to = report_to
        # Live-control endpoint: env override, else derive from report_to (/ingest -> /control)
        self._control_url = os.getenv("BREAKERBOX_CONTROL_URL")
        if not self._control_url and report_to and "/" in report_to:
            self._control_url = f"{report_to.rsplit('/', 1)[0]}/control"
        self._otel = None
        if otel:
            from breakerbox.otel import OtelSpans

            self._otel = OtelSpans()
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
        if self._otel is not None and run.otel_run_span is not None:
            reason = run.tripwire.reason.value if run.tripwire.reason else None
            self._otel.end_run(run.otel_run_span, run.ledger.total_spent(), trip_reason=reason)
        html_path, summary = write_report(run.run_id, run.eventlog.path, self.report_dir)
        run.report_path = html_path
        self.last_report_path = html_path
        if run.sink is not None:
            run.sink.finish(summary)
        if self.live and not callable(self.live) and sys.stderr.isatty():
            print(file=sys.stderr)  # end the in-place live line before the receipt
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
                self.report_to, key=os.getenv("BREAKERBOX_INGEST_KEY"), run_id=run_id
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
                "tags": self.tags,
            },
        )
        control = None
        if self.report_to and self._control_url:
            control = ControlPoller(
                self._control_url, run_id, key=os.getenv("BREAKERBOX_INGEST_KEY")
            )
        run = _Run(
            run_id, ledger, tripwire, eventlog, sink=sink, control=control,
            loop=make_detector(self.detect_loops),
        )
        if self._otel is not None:
            run.otel_run_span = self._otel.start_run(run_id, self.budget_micro)
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
    report_dir: str | Path = "./breakerbox_reports",
    report_to: str | None = None,
    otel: bool = False,
    detect_loops: bool | dict = False,
    live: bool | Callable = False,
    max_depth: int | None = None,
    alerts: bool | dict | Callable = False,
    tags: dict | None = None,
) -> GuardedApp:
    return GuardedApp(
        app, budget_usd, max_hops, ttl_seconds, velocity_usd_per_min, on_trip,
        sub_budgets, topup_policy, unknown_model, report_dir, report_to, otel,
        detect_loops, live, max_depth, alerts, tags,
    )
