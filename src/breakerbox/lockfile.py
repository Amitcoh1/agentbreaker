"""Cost Lockfile (#81): pin the price table + each spec's worst-case ceiling, CI-checkable.

Like package-lock.json, but for dollars. A committed `breakerbox.lock` records the price-table
version and the provable ceiling of each spec at lock time; `breakerbox lock --check` fails in CI if
prices moved or a spec's ceiling drifted. Only meaningful because the ceiling is deterministic and
static — runtime spend has nothing stable to lock. Builds on the Provable Cost Ceiling (#79).
"""

from __future__ import annotations

from dataclasses import dataclass

from breakerbox import graphspec
from breakerbox.ceiling import cost_ceiling
from breakerbox.pricing import PriceTable

LOCK_VERSION = 1


def _entry(spec_path: str, table: PriceTable) -> dict:
    c = cost_ceiling(graphspec.load_spec(spec_path), table=table)
    return {
        "ceiling_usd": c.ceiling_usd,
        "basis": c.basis,
        "bounded": c.bounded,
        "max_hops": c.max_hops,
        "unpriced_models": c.unpriced_models,
    }


def build_lock(spec_paths, table: PriceTable | None = None) -> dict:
    table = table or PriceTable.load(unknown_model="fail")
    return {
        "lock_version": LOCK_VERSION,
        "price_table_version": table.version,
        "specs": {p: _entry(p, table) for p in sorted(spec_paths)},
    }


@dataclass
class Drift:
    kind: str  # "price_table" | "ceiling" | "missing"
    spec: str | None
    message: str


def check_lock(lock: dict, table: PriceTable | None = None) -> list[Drift]:
    """Recompute against current prices; return every drift from the lock (empty = clean)."""
    table = table or PriceTable.load(unknown_model="fail")
    drifts: list[Drift] = []
    locked_ver = lock.get("price_table_version")
    if locked_ver != table.version:
        msg = f"price table changed: locked {locked_ver} → now {table.version}"
        drifts.append(Drift("price_table", None, msg))
    for path, locked in (lock.get("specs") or {}).items():
        try:
            current = _entry(path, table)
        except FileNotFoundError:
            drifts.append(Drift("missing", path, f"{path}: spec file not found"))
            continue
        if current != locked:
            lc, cc = locked.get("ceiling_usd"), current["ceiling_usd"]
            msg = f"{path}: ceiling drifted (locked {lc} → now {cc})"
            drifts.append(Drift("ceiling", path, msg))
    return drifts
