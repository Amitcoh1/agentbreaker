"""Optional OpenTelemetry export (``guard(otel=True)``).

One span per guarded run (``breakerbox.run``) with a child span per model hop
(``chat <model>``) and tool hop (``execute_tool <name>``), tagged with the OTel GenAI
semantic conventions (``gen_ai.*``) plus a ``breakerbox.cost_usd`` attribute.

You configure the TracerProvider / exporter in your app the normal OTel way; breakerbox only
emits the spans. Optional dependency: ``pip install 'breakerbox[otel]'``.
"""

from __future__ import annotations


def _require_otel():
    try:
        from opentelemetry import trace
        from opentelemetry.trace import SpanKind, Status, StatusCode
    except ImportError as e:  # pragma: no cover - only hit without the extra installed
        raise ImportError(
            "guard(otel=True) needs OpenTelemetry — install it with: pip install 'breakerbox[otel]'"
        ) from e
    return trace, SpanKind, Status, StatusCode


def _split_model(model: str) -> tuple[str, str]:
    provider, _, name = model.partition("/")
    return (provider, name) if name else ("unknown", model)


class OtelSpans:
    """Emits GenAI-semantic-convention spans for a guarded run. Created lazily when otel=True."""

    def __init__(self) -> None:
        self._trace, self._Kind, self._Status, self._Code = _require_otel()
        self._tracer = self._trace.get_tracer("breakerbox")

    def start_run(self, run_id: str, budget_micro: int):
        span = self._tracer.start_span("breakerbox.run", kind=self._Kind.INTERNAL)
        span.set_attribute("breakerbox.run_id", run_id)
        span.set_attribute("breakerbox.budget_usd", budget_micro / 1_000_000)
        return span

    def end_run(self, span, spent_micro: int, trip_reason: str | None = None) -> None:
        span.set_attribute("breakerbox.spent_usd", spent_micro / 1_000_000)
        if trip_reason:
            span.set_attribute("breakerbox.trip_reason", trip_reason)
        span.end()

    def start_hop(self, run_span, node: str, model: str):
        provider, name = _split_model(model)
        ctx = self._trace.set_span_in_context(run_span) if run_span is not None else None
        span = self._tracer.start_span(f"chat {name}", context=ctx, kind=self._Kind.CLIENT)
        span.set_attribute("gen_ai.operation.name", "chat")
        span.set_attribute("gen_ai.system", provider)
        span.set_attribute("gen_ai.request.model", name)
        span.set_attribute("breakerbox.node", node)
        return span

    def end_hop(self, span, tokens_in, tokens_out, cost_micro: int, error=None) -> None:
        if tokens_in is not None:
            span.set_attribute("gen_ai.usage.input_tokens", int(tokens_in))
        if tokens_out is not None:
            span.set_attribute("gen_ai.usage.output_tokens", int(tokens_out))
        span.set_attribute("breakerbox.cost_usd", cost_micro / 1_000_000)
        if error is not None:
            span.set_status(self._Status(self._Code.ERROR, str(error)))
        span.end()

    def tool_span(self, run_span, name: str, side_effecting: bool) -> None:
        # Tools have no end callback in the handler, so this is a point-in-time span.
        ctx = self._trace.set_span_in_context(run_span) if run_span is not None else None
        span = self._tracer.start_span(
            f"execute_tool {name}", context=ctx, kind=self._Kind.INTERNAL
        )
        span.set_attribute("gen_ai.operation.name", "execute_tool")
        span.set_attribute("gen_ai.tool.name", name)
        span.set_attribute("breakerbox.side_effecting", side_effecting)
        span.end()
