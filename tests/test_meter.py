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
