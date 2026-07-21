import json

import pytest

from agentbreaker.pricing import (
    PriceTable,
    Rate,
    UnknownModelError,
    cost_microusd,
    default_table,
)

# A small self-contained table so tests don't depend on prices.json values drifting.
TABLE = PriceTable(
    models={"openai/gpt-4o": {"in_per_mtok_usd": 2.50, "out_per_mtok_usd": 10.00}},
    default_rate={"in_per_mtok_usd": 5.00, "out_per_mtok_usd": 15.00},
    version="test",
)


def test_known_model_cost_in_microdollars():
    # 1000 in * 2.50 + 500 out * 10.00 = 2500 + 5000 = 7500 microUSD = $0.0075
    assert TABLE.cost_microusd("openai/gpt-4o", 1000, 500) == 7500


def test_cost_matches_usd_definition():
    tin, tout = 1840, 512
    r = TABLE.rate("openai/gpt-4o")
    expected_usd = tin / 1e6 * r.in_per_mtok_usd + tout / 1e6 * r.out_per_mtok_usd
    assert TABLE.cost_microusd("openai/gpt-4o", tin, tout) == round(expected_usd * 1e6)


def test_zero_tokens_is_zero():
    assert TABLE.cost_microusd("openai/gpt-4o", 0, 0) == 0


def test_unknown_model_fail_raises():
    t = PriceTable(models={}, unknown_model="fail")
    with pytest.raises(UnknownModelError):
        t.cost_microusd("ghost/model", 100, 100)


def test_unknown_model_default_rate_used_never_zero():
    t = PriceTable(
        models={},
        default_rate={"in_per_mtok_usd": 5.00, "out_per_mtok_usd": 15.00},
        unknown_model="default_rate",
    )
    cost = t.cost_microusd("ghost/model", 1000, 1000)
    assert cost == 1000 * 5 + 1000 * 15 == 20000
    assert cost > 0


def test_unknown_model_default_rate_but_no_default_still_raises():
    # policy=default_rate but table has no default_rate -> must not silently be $0
    t = PriceTable(models={}, default_rate=None, unknown_model="default_rate")
    with pytest.raises(UnknownModelError):
        t.rate("ghost/model")


def test_override_wins():
    t = PriceTable(
        models={"openai/gpt-4o": {"in_per_mtok_usd": 2.50, "out_per_mtok_usd": 10.00}},
    )
    override = PriceTable(
        models={
            "openai/gpt-4o": Rate(in_per_mtok_usd=99.0, out_per_mtok_usd=99.0),
        },
    )
    assert t.cost_microusd("openai/gpt-4o", 1000, 0) == 2500
    assert override.cost_microusd("openai/gpt-4o", 1000, 0) == 99000


def test_load_bundled_table_has_version_and_known_model():
    t = PriceTable.load()
    assert t.version is not None
    assert t.cost_microusd("openai/gpt-4o", 1_000_000, 0) == round(2.50 * 1e6)


def test_load_with_overrides(tmp_path):
    p = tmp_path / "prices.json"
    p.write_text(
        json.dumps(
            {
                "version": "x",
                "models": {"a/b": {"in_per_mtok_usd": 1.0, "out_per_mtok_usd": 2.0}},
                "default_rate": {"in_per_mtok_usd": 9.0, "out_per_mtok_usd": 9.0},
            }
        )
    )
    t = PriceTable.load(p, overrides={"a/b": {"in_per_mtok_usd": 100.0, "out_per_mtok_usd": 0.0}})
    assert t.cost_microusd("a/b", 1000, 1000) == 100000


def test_module_level_cost_uses_bundled_table():
    assert cost_microusd("openai/gpt-4o", 1000, 500) == 7500
    # explicit table wins
    assert cost_microusd("openai/gpt-4o", 1000, 500, table=TABLE) == 7500


def test_default_table_is_cached():
    assert default_table() is default_table()
