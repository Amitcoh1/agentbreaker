"""Starter templates for ``breakerbox init``.

Each template is a valid graph spec (see :mod:`breakerbox.graphspec`) with budgets, a velocity
limit, and side-effect tags already wired for a common pattern — zero-to-guarded fast. ``init``
writes the spec JSON plus the generated guarded Python; from there you fill in the node bodies.
"""

from __future__ import annotations

import copy

# name -> (one-line description, spec). Specs are linear on purpose: valid by construction and
# easy to read as a starting point. Σ(sub_budget_usd) stays under config.budget_usd in each.
_TEMPLATES: dict[str, tuple[str, dict]] = {
    "research-agent": (
        "Plan → web search → synthesize. Read-only, pauses on trip.",
        {
            "version": "1",
            "config": {
                "budget_usd": 5.0,
                "max_hops": 50,
                "ttl_seconds": 600,
                "velocity_usd_per_min": 2.0,
                "on_trip": "pause",
            },
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "plan", "type": "model", "model": "openai/gpt-4o",
                 "max_tokens": 1024, "sub_budget_usd": 2.0},
                {"id": "search", "type": "tool", "name": "web_search", "side_effecting": False},
                {"id": "synthesize", "type": "model", "model": "anthropic/claude-sonnet-4-6",
                 "max_tokens": 2048, "sub_budget_usd": 2.5},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"source": "start", "target": "plan"},
                {"source": "plan", "target": "search"},
                {"source": "search", "target": "synthesize"},
                {"source": "synthesize", "target": "end"},
            ],
        },
    ),
    "support-triage": (
        "Classify → draft reply → send. Kills on trip (the send step is side-effecting).",
        {
            "version": "1",
            "config": {
                "budget_usd": 1.5,
                "max_hops": 25,
                "ttl_seconds": 300,
                "velocity_usd_per_min": 0.75,
                "on_trip": "kill",
            },
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "classify", "type": "model", "model": "openai/gpt-4o-mini",
                 "max_tokens": 256, "sub_budget_usd": 0.3},
                {"id": "draft_reply", "type": "model", "model": "anthropic/claude-sonnet-4-6",
                 "max_tokens": 1024, "sub_budget_usd": 1.0},
                {"id": "send_email", "type": "tool", "name": "send_email", "side_effecting": True},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"source": "start", "target": "classify"},
                {"source": "classify", "target": "draft_reply"},
                {"source": "draft_reply", "target": "send_email"},
                {"source": "send_email", "target": "end"},
            ],
        },
    ),
    "batch-extract": (
        "Fetch → extract → validate. Tight velocity limit, kills on trip (for unattended runs).",
        {
            "version": "1",
            "config": {
                "budget_usd": 3.0,
                "max_hops": 100,
                "ttl_seconds": 900,
                "velocity_usd_per_min": 1.0,
                "on_trip": "kill",
            },
            "nodes": [
                {"id": "start", "type": "start"},
                {"id": "fetch", "type": "tool", "name": "http_get", "side_effecting": False},
                {"id": "extract", "type": "model", "model": "openai/gpt-4o-mini",
                 "max_tokens": 512, "sub_budget_usd": 1.5},
                {"id": "validate_out", "type": "model", "model": "anthropic/claude-sonnet-4-6",
                 "max_tokens": 512, "sub_budget_usd": 1.0},
                {"id": "end", "type": "end"},
            ],
            "edges": [
                {"source": "start", "target": "fetch"},
                {"source": "fetch", "target": "extract"},
                {"source": "extract", "target": "validate_out"},
                {"source": "validate_out", "target": "end"},
            ],
        },
    ),
}


def names() -> list[str]:
    """Available template names."""
    return list(_TEMPLATES)


def describe(name: str) -> str:
    """One-line description for ``name`` (KeyError if unknown)."""
    return _TEMPLATES[name][0]


def catalog() -> list[tuple[str, str]]:
    """``(name, description)`` for every template, for listing."""
    return [(n, desc) for n, (desc, _spec) in _TEMPLATES.items()]


def get(name: str) -> dict | None:
    """A fresh copy of ``name``'s spec, or ``None`` if unknown. Copied so callers can't mutate."""
    entry = _TEMPLATES.get(name)
    return copy.deepcopy(entry[1]) if entry is not None else None
