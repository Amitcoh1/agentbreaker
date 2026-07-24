"""Live-control demo: stream a guarded runaway to the cloud dashboard, then (optionally)
kill it from the control endpoint — the exact call the dashboard's Kill button makes.

    export BREAKERBOX_INGEST_KEY=<INGEST_KEY>          # library -> ingest/control auth
    python live_demo.py \
        --ingest-url  https://<REF>.functions.supabase.co/ingest \
        --control-url https://<REF>.functions.supabase.co/control \
        --control-key <CONTROL_KEY> --self-kill

Open the dashboard at /runs/<printed run_id> to watch it live. Without --self-kill, the run
just streams — open the Controls tab and click Kill yourself.
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
import urllib.request
from typing import TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import BudgetKilled, BudgetPaused, guard


class SlowModel(BaseChatModel):
    """A deliberately slow, context-accumulating model so the run is watchable."""

    model: str = "openai/gpt-4o"
    max_tokens: int = 300

    @property
    def _llm_type(self) -> str:
        return "slow"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        time.sleep(0.6)
        msg = AIMessage(
            content="working on it… " * 40,
            usage_metadata={"input_tokens": 400, "output_tokens": 300, "total_tokens": 700},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    hop: int


def build(loops: int):
    model = SlowModel()

    def call(state):
        model.invoke([HumanMessage(content="continue the task")], max_tokens=model.max_tokens)
        return {"hop": state["hop"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["hop"] >= loops else "call", {"call": "call", END: END}
    )
    return graph.compile()


def issue_kill(control_url: str, control_key: str, run_id: str, delay: float) -> None:
    time.sleep(delay)
    req = urllib.request.Request(
        control_url,
        data=json.dumps({"run_id": run_id, "command": "kill"}).encode(),
        method="POST",
        headers={"content-type": "application/json", "x-control-key": control_key},
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
        print(f"[dashboard] kill issued for run {run_id}")
    except Exception as exc:  # noqa: BLE001
        print("kill request failed:", exc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest-url", required=True)
    ap.add_argument("--control-url", default=None)
    ap.add_argument("--control-key", default=None)
    ap.add_argument("--self-kill", action="store_true", help="self-issue a kill after 4s")
    ap.add_argument("--loops", type=int, default=40)
    args = ap.parse_args()

    if args.control_url:
        os.environ["BREAKERBOX_CONTROL_URL"] = args.control_url

    app = guard(
        build(args.loops),
        budget_usd=50.0,
        max_hops=1000,
        on_trip="kill",
        report_dir="/tmp/ab_live",
        report_to=args.ingest_url,
    )

    outcome: dict = {}

    def run():
        try:
            outcome["result"] = app.invoke({"hop": 0}, {"recursion_limit": 2000})
        except (BudgetKilled, BudgetPaused) as stop:
            outcome["stopped"] = stop

    worker = threading.Thread(target=run)
    worker.start()

    run_id = None
    for _ in range(100):
        if app._runs:
            run_id = next(iter(app._runs.values())).run_id
            break
        time.sleep(0.05)
    print(f"run_id: {run_id}  — open /runs/{run_id} in the dashboard")

    if args.self_kill and run_id and args.control_url and args.control_key:
        threading.Thread(
            target=issue_kill, args=(args.control_url, args.control_key, run_id, 4.0)
        ).start()

    worker.join()
    if "stopped" in outcome:
        s = outcome["stopped"]
        print(f"STOPPED: {type(s).__name__} reason={s.reason} spent=${s.spent_usd:.4f}")
    else:
        print(f"completed: {outcome.get('result')}")


if __name__ == "__main__":
    main()
