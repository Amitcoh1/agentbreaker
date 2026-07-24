import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import TypedDict

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import BudgetKilled, guard


class _Fake(BaseChatModel):
    model: str = "openai/gpt-4o"

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        msg = AIMessage(
            content="ok",
            usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        )
        return ChatResult(generations=[ChatGeneration(message=msg)])


class S(TypedDict):
    count: int


def _build(loops: int):
    model = _Fake()

    def call(state):
        time.sleep(0.01)  # keep the run alive long enough for the poller to deliver
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["count"] >= loops else "call", {"call": "call", END: END}
    )
    return graph.compile()


def test_remote_kill_stops_at_next_hop(tmp_path):
    # Server: POST /ingest swallows events; GET /control returns a standing "kill".
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            self.rfile.read(length)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")

        def do_GET(self):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"command": "kill"}).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        guarded = guard(
            _build(200), budget_usd=100.0, on_trip="kill", report_dir=tmp_path,
            report_to=f"http://127.0.0.1:{port}/ingest",  # control derived to /control
        )
        with pytest.raises(BudgetKilled) as exc:
            guarded.invoke({"count": 0}, {"recursion_limit": 500})
    finally:
        server.shutdown()

    assert exc.value.reason == "remote"
    run = next(iter(guarded._runs.values()))
    types = [e.type for e in run.eventlog.events]
    assert "control" in types  # the remote command was recorded
    # stopped well before the loop's natural end
    assert types.count("reconcile") < 200
