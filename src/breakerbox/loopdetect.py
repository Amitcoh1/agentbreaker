"""Semantic loop detection (#82): a no-LLM, deterministic fuzzy-repeat detector for the guard path.

A runaway agent usually loops on near-identical calls — the same node re-invoked with barely-changed
input — burning tokens long before the dollar budget trips. This catches that cheaply: each model
hop's input is reduced to a set of character shingles, and if enough recent same-node hops are
≥threshold similar (Jaccard), the run trips with TripReason.LOOP. No model calls, no embeddings —
it honours "no LLM in the hot path". Shingles (not a whole-string hash) make it paraphrase-resistant
— nudging one argument shifts only a few shingles, so a near-identical repeat is still caught.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class LoopDetector:
    """Per-run sliding-window detector. Build one per run — the window is mutable state."""

    window: int = 12  # how many recent hops to look back over
    threshold: float = 0.9  # Jaccard similarity (0–1] that counts as "near-identical"
    repeats: int = 3  # trip once this many prior near-identical same-node hops sit in the window
    shingle: int = 5  # character n-gram size

    _recent: deque[tuple[str, frozenset[str]]] = field(
        default_factory=deque, init=False, repr=False
    )

    def __post_init__(self) -> None:
        if not 0.0 < self.threshold <= 1.0:
            raise ValueError(f"threshold must be in (0, 1], got {self.threshold}")
        if self.window < 1 or self.repeats < 1 or self.shingle < 1:
            raise ValueError("window, repeats and shingle must all be >= 1")
        self._recent = deque(maxlen=self.window)

    def _shingles(self, text: str) -> frozenset[str]:
        norm = " ".join(text.lower().split())  # case- + whitespace-insensitive
        if len(norm) <= self.shingle:
            return frozenset((norm,)) if norm else frozenset()
        return frozenset(norm[i : i + self.shingle] for i in range(len(norm) - self.shingle + 1))

    @staticmethod
    def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
        if not a and not b:
            return 1.0
        if not a or not b:
            return 0.0
        inter = len(a & b)
        return inter / (len(a) + len(b) - inter)

    def observe(self, node: str, text: str) -> bool:
        """Record one hop; return True when it completes a near-identical repeat loop."""
        sh = self._shingles(text)
        near = sum(
            1 for n, prev in self._recent if n == node and self._jaccard(sh, prev) >= self.threshold
        )
        self._recent.append((node, sh))
        return near >= self.repeats


def make_detector(spec: bool | dict) -> LoopDetector | None:
    """Build a fresh detector from the `detect_loops` value.

    `False`/`None` → off; `True` → defaults; `dict` → tuned (window/threshold/repeats/shingle).
    """
    if not spec:
        return None
    if spec is True:
        return LoopDetector()
    return LoopDetector(**spec)
