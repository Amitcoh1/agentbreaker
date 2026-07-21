"""Price table + cost calculator.

Budget unit is the microdollar (1 USD = 1_000_000 microUSD), never tokens.
An unknown model must NEVER be metered as $0 (the LiteLLM #24770 bug class):
either it resolves to a rate or it raises before any dispatch.

Cost identity (why the formula has no division):
    cost_usd      = tokens / 1e6 * price_per_mtok_usd
    cost_microusd = cost_usd * 1e6 = tokens * price_per_mtok_usd
so microdollars fall straight out of tokens * rate.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path
from typing import Literal

MICRO_PER_USD = 1_000_000

UnknownModelPolicy = Literal["fail", "default_rate"]


class UnknownModelError(KeyError):
    """Model absent from the price table while policy is 'fail'."""


@dataclass(frozen=True)
class Rate:
    in_per_mtok_usd: float
    out_per_mtok_usd: float


def _as_rate(value: Rate | dict) -> Rate:
    return value if isinstance(value, Rate) else Rate(**value)


class PriceTable:
    def __init__(
        self,
        models: dict[str, Rate | dict],
        default_rate: Rate | dict | None = None,
        version: str | None = None,
        unknown_model: UnknownModelPolicy = "fail",
    ) -> None:
        self.version = version
        self.unknown_model = unknown_model
        self._models: dict[str, Rate] = {k: _as_rate(v) for k, v in models.items()}
        self._default = _as_rate(default_rate) if default_rate is not None else None

    @classmethod
    def load(
        cls,
        path: str | Path | None = None,
        *,
        overrides: dict[str, Rate | dict] | None = None,
        unknown_model: UnknownModelPolicy = "fail",
    ) -> PriceTable:
        """Load from the bundled prices.json (path=None) or a given file.

        `overrides` merges on top of the file's models (override wins).
        """
        if path is None:
            raw = files("agentbreaker").joinpath("prices.json").read_text()
        else:
            raw = Path(path).read_text()
        data = json.loads(raw)
        models = dict(data.get("models", {}))
        if overrides:
            models.update(overrides)
        return cls(
            models,
            default_rate=data.get("default_rate"),
            version=data.get("version"),
            unknown_model=unknown_model,
        )

    def rate(self, model: str) -> Rate:
        rate = self._models.get(model)
        if rate is not None:
            return rate
        if self.unknown_model == "default_rate" and self._default is not None:
            return self._default
        raise UnknownModelError(
            f"Unknown model {model!r} (policy={self.unknown_model!r}). "
            "Add it to the price table or pass unknown_model='default_rate'."
        )

    def cost_microusd(self, model: str, tokens_in: int, tokens_out: int) -> int:
        rate = self.rate(model)
        return round(tokens_in * rate.in_per_mtok_usd + tokens_out * rate.out_per_mtok_usd)


_default_table: PriceTable | None = None


def default_table() -> PriceTable:
    """Cached bundled price table (unknown_model='fail')."""
    global _default_table
    if _default_table is None:
        _default_table = PriceTable.load()
    return _default_table


def cost_microusd(
    model: str, tokens_in: int, tokens_out: int, *, table: PriceTable | None = None
) -> int:
    return (table or default_table()).cost_microusd(model, tokens_in, tokens_out)
