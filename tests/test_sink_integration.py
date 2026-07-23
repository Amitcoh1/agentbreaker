import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langgraph.graph import END, START, StateGraph

from breakerbox import guard


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
        model.invoke([HumanMessage(content="hi")])
        return {"count": state["count"] + 1}

    graph = StateGraph(S)
    graph.add_node("call", call)
    graph.add_edge(START, "call")
    graph.add_conditional_edges(
        "call", lambda s: END if s["count"] >= loops else "call", {"call": "call", END: END}
    )
    return graph.compile()


def test_report_to_posts_events_and_summary(tmp_path):
    captured: list[dict] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            captured.append(json.loads(self.rfile.read(length)))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *args):  # silence
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        guarded = guard(
            _build(2), budget_usd=100.0, on_trip="kill", report_dir=tmp_path,
            report_to=f"http://127.0.0.1:{port}/ingest",
        )
        guarded.invoke({"count": 0})
    finally:
        server.shutdown()

    all_events = [e for body in captured for e in body.get("events", [])]
    types = {e["type"] for e in all_events}
    assert {"start", "reserve", "reconcile", "finish"} <= types
    assert all(body["run_id"] for body in captured)
    summaries = [body["summary"] for body in captured if body.get("summary")]
    assert summaries and summaries[-1]["status"] == "completed"
