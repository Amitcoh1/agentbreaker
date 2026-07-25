"""Unit tests for the #82 semantic loop detector — no LLM, deterministic fuzzy repeat detection."""

import pytest

from breakerbox.loopdetect import LoopDetector, make_detector


def _first_trip(det, node, text, n):
    """Observe (node, text) up to n times; return the 1-based call index that first tripped."""
    for i in range(1, n + 1):
        if det.observe(node, text):
            return i
    return None


def test_identical_repeats_trip_after_repeats_priors():
    det = LoopDetector(repeats=3)  # 3 near-identical priors → the 4th identical call trips
    assert _first_trip(det, "call", "do the thing", 10) == 4


def test_distinct_calls_never_trip():
    det = LoopDetector(repeats=3)
    for i in range(20):
        text = f"completely different request {i} about an unrelated topic {i * 7}"
        assert det.observe("call", text) is False


def test_different_nodes_do_not_cross_count():
    det = LoopDetector(repeats=2)
    assert det.observe("a", "same text") is False  # a: 0 priors
    assert det.observe("b", "same text") is False  # b: 0 priors — a's call is not counted for b
    assert det.observe("a", "same text") is False  # a: 1 prior a (b ignored) < 2
    assert det.observe("b", "same text") is False  # b: 1 prior b < 2
    assert det.observe("a", "same text") is True  # a: 2 priors a → trip


def test_case_and_whitespace_are_ignored():
    det = LoopDetector(repeats=3)
    variants = ["Search FOO", "search   foo", "SEARCH\tfoo", "search foo"]
    assert any(det.observe("n", v) for v in variants)  # all normalize to "search foo" → trips


def test_slight_arg_nudge_does_not_evade():
    # A realistic loop: a big shared prompt with a tiny trailing change each iteration.
    det = LoopDetector(repeats=3, threshold=0.9)
    base = (
        "You are a research assistant. Search the web for information about quantum "
        "error correction and summarize the top three results as a markdown table"
    )
    tripped_at = None
    for i, suffix in enumerate([".", "!", "?", " x", " y"], start=1):
        if det.observe("agent", base + suffix):
            tripped_at = i
            break
    assert tripped_at is not None, "nudged near-duplicates evaded the detector"


def test_window_below_repeats_cannot_trip():
    det = LoopDetector(window=2, repeats=3)  # at most 2 priors held → never reaches 3
    assert _first_trip(det, "call", "x", 50) is None


def test_bad_config_raises():
    for bad in (0, 1.5, -0.1):
        with pytest.raises(ValueError):
            LoopDetector(threshold=bad)
    with pytest.raises(ValueError):
        LoopDetector(window=0)
    with pytest.raises(ValueError):
        LoopDetector(repeats=0)


def test_make_detector():
    assert make_detector(False) is None
    assert make_detector(None) is None
    assert isinstance(make_detector(True), LoopDetector)
    d = make_detector({"window": 5, "threshold": 0.8, "repeats": 2})
    assert (d.window, d.threshold, d.repeats) == (5, 0.8, 2)
    with pytest.raises(TypeError):
        make_detector({"bogus": 1})  # unknown key surfaces clearly
