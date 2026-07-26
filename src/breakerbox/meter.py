"""Self-metering: count tokens locally, then reconcile against the provider.

F3: never trust only the provider's `usage`. We count input tokens locally and
accumulate streamed output chunks, then compare to what the provider reports and
flag a discrepancy over `TOLERANCE`. Cost is billed on the provider's numbers when
present (that's what you pay), local counts are the cross-check / streaming fallback.
"""

from __future__ import annotations

import tiktoken

DEFAULT_MAX_OUTPUT_TOKENS = 1024  # ponytail: reserve fallback when max_tokens is unset
TOLERANCE = 0.15  # flag if local vs provider diverge > 15%
_PER_MESSAGE_OVERHEAD = 4

_ENCODERS: dict[str, tiktoken.Encoding] = {}

# Per-family correction on the o200k baseline for models without an exact tiktoken tokenizer.
# Exact offline tokenizers for these families aren't available (Anthropic/Google `count_tokens`
# is an API call, which would break "no LLM in the hot path" + offline). These are conservative
# approximations — they lean slightly HIGH so the reserve never under-counts a budget — and the
# ACTUAL billed count is always reconciled against the provider's reported usage (#89).
_FAMILY_FACTOR = {"anthropic": 1.15, "google": 1.1, "gemini": 1.1}


def _family(model: str) -> str:
    return model.split("/")[0].lower() if "/" in model else ""


def _factor(model: str) -> float:
    return _FAMILY_FACTOR.get(_family(model), 1.0)


def _encoder(model: str) -> tiktoken.Encoding:
    name = model.split("/")[-1]
    enc = _ENCODERS.get(name)
    if enc is None:
        try:
            enc = tiktoken.encoding_for_model(name)  # exact for OpenAI families
        except KeyError:
            enc = tiktoken.get_encoding("o200k_base")  # base for others; refined by _factor
        _ENCODERS[name] = enc
    return enc


def count_text_tokens(text: str, model: str) -> int:
    return round(len(_encoder(model).encode(text or "")) * _factor(model))


def _content_to_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):  # multimodal blocks
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(str(block.get("text", "")))
            else:
                parts.append(str(block))
        return " ".join(parts)
    return str(content)


def count_message_tokens(messages, model: str) -> int:
    """messages: iterable of BaseMessage-like (has .content) or plain strings."""
    enc = _encoder(model)
    factor = _factor(model)
    total = 0
    for m in messages:
        content = getattr(m, "content", m)
        total += round(len(enc.encode(_content_to_text(content))) * factor) + _PER_MESSAGE_OVERHEAD
    return total + 3  # priming


class StreamMeter:
    """Accumulates output tokens across streamed chunks for one call."""

    def __init__(self, model: str) -> None:
        self.model = model
        self.tokens = 0

    def add_chunk(self, text: str) -> None:
        if text:
            self.tokens += count_text_tokens(text, self.model)


def reconcile_usage(
    local_in: int,
    local_out: int,
    provider_in: int | None,
    provider_out: int | None,
    tolerance: float = TOLERANCE,
) -> tuple[int, int, dict]:
    """Return (billed_in, billed_out, flags). Prefer provider counts; flag drift."""
    final_in = provider_in if provider_in is not None else local_in
    final_out = provider_out if provider_out is not None else local_out
    flags: dict[str, dict] = {}
    for name, local, prov in (("in", local_in, provider_in), ("out", local_out, provider_out)):
        if prov is not None and prov > 0:
            diff = abs(local - prov) / prov
            if diff > tolerance:
                flags[name] = {"local": local, "provider": prov, "diff": round(diff, 3)}
    return final_in, final_out, flags
