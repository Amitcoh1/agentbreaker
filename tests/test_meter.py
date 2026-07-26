from langchain_core.messages import HumanMessage

from breakerbox.meter import (
    StreamMeter,
    count_message_tokens,
    count_text_tokens,
    reconcile_usage,
)


def test_count_text_tokens_positive_and_empty():
    assert count_text_tokens("hello world", "openai/gpt-4o") > 0
    assert count_text_tokens("", "openai/gpt-4o") == 0


def test_count_message_tokens():
    assert count_message_tokens([HumanMessage(content="hello there friend")], "openai/gpt-4o") > 0


def test_non_openai_model_still_counts():
    # must fall back to an approximate encoder, not raise
    assert count_text_tokens("hi there", "anthropic/claude-sonnet-4-6") > 0


def test_stream_meter_accumulates():
    sm = StreamMeter("openai/gpt-4o")
    sm.add_chunk("hello ")
    sm.add_chunk("world")
    sm.add_chunk("")  # empty chunk is a no-op
    assert sm.tokens > 0


def test_reconcile_prefers_provider_and_flags_drift():
    billed_in, billed_out, flags = reconcile_usage(100, 100, 120, 200)
    assert (billed_in, billed_out) == (120, 200)  # provider counts win for billing
    assert "out" in flags  # 100 vs 200 -> flagged


def test_reconcile_without_provider_uses_local():
    billed_in, billed_out, flags = reconcile_usage(100, 50, None, None)
    assert (billed_in, billed_out) == (100, 50)
    assert flags == {}


def test_per_family_tokenizer_factor():
    # #89: per-family token accounting — OpenAI exact, non-OpenAI o200k × a conservative factor.
    import tiktoken

    from breakerbox.meter import _factor

    assert _factor("openai/gpt-4o") == 1.0
    assert _factor("anthropic/claude-sonnet-4-6") == 1.15
    assert _factor("google/gemini-2.0") == 1.1
    assert _factor("mistral/mixtral") == 1.0  # graceful fallback for unknown families
    assert _factor("bare-model-name") == 1.0

    text = "The quick brown fox jumps over the lazy dog. " * 8
    base = len(tiktoken.get_encoding("o200k_base").encode(text))
    claude, gpt = "anthropic/claude-sonnet-4-6", "openai/gpt-4o"
    # Anthropic count = o200k baseline × its family factor (leans high, safe for a budget).
    assert count_text_tokens(text, claude) == round(base * 1.15)
    assert count_text_tokens(text, claude) > count_text_tokens(text, gpt)


def test_message_tokens_apply_family_factor():
    msgs = [HumanMessage(content="Summarize the quarterly report in three tight bullet points.")]
    claude, gpt = "anthropic/claude-sonnet-4-6", "openai/gpt-4o"
    assert count_message_tokens(msgs, claude) > count_message_tokens(msgs, gpt)
