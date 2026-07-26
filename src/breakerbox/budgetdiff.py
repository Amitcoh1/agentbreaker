"""Budget Diff (#80): the worst-case ceiling delta between two files — spec.json or generated .py.

Catches "this prompt edit raised your ceiling from $2 to $9" at the PR, where runtime tools are
structurally blind (the invoice only moves weeks later). Git-native: point it at two committed
generated files (the ceiling is baked into their header by #79) or two spec versions. Builds on the
Provable Cost Ceiling (#79).
"""

from __future__ import annotations

import re
from pathlib import Path

from breakerbox import graphspec
from breakerbox.ceiling import _fmt_usd, cost_ceiling

# Matches the ceiling line #79 bakes into generated Python (any of the four shapes).
_CEIL_RE = re.compile(r"Cost ceiling:\s*(?:≤\s*\$([0-9.]+)|(UNBOUNDED)|(not priced))")


def ceiling_of(path: str) -> tuple[float | None, str]:
    """(usd, kind) for a spec.json (recomputed) or a generated .py (header parsed).

    kind ∈ bounded | unbounded | unpriced | none.
    """
    if path.endswith(".json"):
        c = cost_ceiling(graphspec.load_spec(path))
        return (c.ceiling_usd, "bounded") if c.bounded else (None, "unbounded")
    m = _CEIL_RE.search(Path(path).read_text())
    if not m:
        return None, "none"
    if m.group(1):
        return float(m.group(1)), "bounded"
    return (None, "unbounded") if m.group(2) else (None, "unpriced")


def _signed(v: float) -> str:
    return f"{'+' if v >= 0 else '-'}{_fmt_usd(abs(v))}"


def _show(v: float | None, kind: str) -> str:
    return {
        "unbounded": "UNBOUNDED",
        "unpriced": "not priced",
        "none": "no ceiling",
    }.get(kind, _fmt_usd(v))


def diff_ceiling(old_path: str, new_path: str) -> tuple[str, bool]:
    """Return (human message, increased?) — increased means the ceiling rose or lost its bound."""
    a, ak = ceiling_of(old_path)
    b, bk = ceiling_of(new_path)
    increased = (bk == "unbounded" and ak != "unbounded") or (
        ak == "bounded" and bk == "bounded" and b > a
    )
    head = f"Cost ceiling: {_show(a, ak)} → {_show(b, bk)}"
    if ak == "bounded" and bk == "bounded":
        delta = b - a
        pct = f", {delta / a * 100:+.0f}%" if a else ""
        head += f"  ({_signed(delta)}{pct})"
    elif increased:
        head += "  (regression: no provable bound)"
    elif ak == "unbounded" and bk == "bounded":
        head += "  (now bounded)"
    return head, increased
