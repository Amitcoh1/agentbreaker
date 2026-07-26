"""Airgap egress certificate (#88): statically certify which network endpoints a spec can reach.

A proxy *is* the egress and can't attest to code it doesn't see; only a static scan of the spec can
certify the whole surface — model providers (derived from the model strings) and the declared tools.
Powers `breakerbox egress`; `--strict` refuses on an undeclared egress (a model whose provider host
isn't known). Emitting this into the generated header is a separate, byte-parity-locked follow-up.
"""

from __future__ import annotations

from dataclasses import dataclass

# provider prefix -> API host. Extend as families grow; an unknown provider is flagged, not hidden.
_PROVIDER_HOST = {
    "openai": "api.openai.com",
    "anthropic": "api.anthropic.com",
    "google": "generativelanguage.googleapis.com",
    "gemini": "generativelanguage.googleapis.com",
    "mistral": "api.mistral.ai",
    "cohere": "api.cohere.ai",
    "groq": "api.groq.com",
}


@dataclass
class Egress:
    model_hosts: list[str]  # certified provider hosts for the spec's models
    unknown_models: list[str]  # models whose provider host isn't known (undeclared egress)
    tools: list[str]  # tool nodes — egress is implementation-defined (the bodies you fill in)


def certify(spec: dict) -> Egress:
    nodes = spec.get("nodes") or []
    hosts: set[str] = set()
    unknown: set[str] = set()
    tools: set[str] = set()
    for n in nodes:
        if n.get("type") == "model":
            m = n.get("model") or ""
            provider = m.split("/")[0].lower() if "/" in m else ""
            host = _PROVIDER_HOST.get(provider)
            if host:
                hosts.add(host)
            else:
                unknown.add(m or "(unnamed model)")
        elif n.get("type") == "tool":
            tools.add(n.get("name") or n.get("id") or "(unnamed tool)")
    return Egress(sorted(hosts), sorted(unknown), sorted(tools))


def format_certificate(e: Egress) -> str:
    lines = ["Egress certificate (static, from the spec):"]
    if e.model_hosts:
        lines.append("  model providers:")
        lines += [f"    ✓ {h}" for h in e.model_hosts]
    if e.unknown_models:
        lines.append("  ⚠ undeclared egress — unknown provider host:")
        lines += [f"    ? {m}" for m in e.unknown_models]
    if e.tools:
        lines.append("  tools (egress is implementation-defined — see the node bodies):")
        lines += [f"    · {t}" for t in e.tools]
    return "\n".join(lines)
