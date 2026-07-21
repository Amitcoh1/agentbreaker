from agentbreaker.report.generate import (
    render_html,
    render_terminal,
    summarize,
    write_report,
)


def _killed_events():
    return [
        {"run_id": "r1", "seq": 0, "ts": "t", "type": "start",
         "detail": {"budget_micro": 5_000_000, "max_hops": 50}},
        {"run_id": "r1", "seq": 1, "ts": "t", "type": "reserve", "node": "a",
         "model": "openai/gpt-4o", "tokens_in": 100, "estimate_microusd": 11000,
         "cumulative_microusd": 11000},
        {"run_id": "r1", "seq": 2, "ts": "t", "type": "reconcile", "node": "a",
         "model": "openai/gpt-4o", "tokens_in": 100, "tokens_out": 50,
         "estimate_microusd": 11000, "actual_microusd": 750, "cumulative_microusd": 750,
         "detail": {}},
        {"run_id": "r1", "seq": 3, "ts": "t", "type": "tool_call", "node": "send_email",
         "side_effecting": True, "cumulative_microusd": 750},
        {"run_id": "r1", "seq": 4, "ts": "t", "type": "trip", "cumulative_microusd": 750,
         "detail": {"reason": "hops", "on_trip": "kill"}},
    ]


def test_summarize_killed_run():
    s = summarize(_killed_events())
    assert s["status"] == "killed"
    assert s["trip_reason"] == "hops"
    assert s["hops"] == 2  # one reconcile + one tool_call
    assert s["budget_usd"] == 5.0
    assert s["max_hops"] == 50
    assert s["spent_usd"] == 0.00075
    assert s["side_effects_fired"] == ["send_email"]
    # projection: mean cost/hop (one cost-hop @ 750) × 50 = 37500 microUSD
    assert s["projected_uncapped_usd"] == 0.0375
    assert s["saved_usd"] == 0.0375 - 0.00075


def test_completed_run_projection_equals_spent():
    events = [
        {"run_id": "r", "seq": 0, "ts": "t", "type": "start",
         "detail": {"budget_micro": 5_000_000, "max_hops": 50}},
        {"run_id": "r", "seq": 1, "ts": "t", "type": "reconcile", "node": "a", "model": "m",
         "tokens_in": 10, "tokens_out": 5, "actual_microusd": 750, "cumulative_microusd": 750,
         "detail": {}},
        {"run_id": "r", "seq": 2, "ts": "t", "type": "finish", "cumulative_microusd": 750},
    ]
    s = summarize(events)
    assert s["status"] == "completed"
    assert s["projected_uncapped_usd"] == s["spent_usd"] == 0.00075
    assert s["saved_usd"] == 0.0


def test_render_html_is_self_contained():
    html = render_html(summarize(_killed_events()))
    assert "<html" in html and "</html>" in html
    assert "http://" not in html and "https://" not in html  # no external assets
    assert "send_email" in html
    assert "0.0375" in html  # projected headline


def test_render_terminal():
    txt = render_terminal(summarize(_killed_events()))
    assert "AgentBreaker receipt" in txt
    assert "killed" in txt and "hops" in txt
    assert "$0.0375" in txt


def test_write_report_produces_html_and_json(tmp_path):
    events_path = tmp_path / "r1.jsonl"
    import json
    events_path.write_text("\n".join(json.dumps(e) for e in _killed_events()))
    html_path, summary = write_report("r1", events_path, tmp_path)
    assert html_path.exists() and html_path.suffix == ".html"
    assert (tmp_path / "r1.report.json").exists()
    assert summary["status"] == "killed"
