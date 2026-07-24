from breakerbox.pricing import PriceTable
from breakerbox.pricing_update import build_models, build_table

# A LiteLLM-shaped fixture (no network).
LITELLM = {
    "sample_spec": {"litellm_provider": "docs", "mode": "chat", "input_cost_per_token": 0.0},
    "gpt-4o": {
        "litellm_provider": "openai", "mode": "chat",
        "input_cost_per_token": 2.5e-06, "output_cost_per_token": 1e-05,
    },
    "gemini/gemini-2.5-pro": {
        "litellm_provider": "gemini", "mode": "chat",
        "input_cost_per_token": 1.25e-06, "output_cost_per_token": 1e-05,
    },
    "text-embedding-3-small": {
        "litellm_provider": "openai", "mode": "embedding", "input_cost_per_token": 2e-08,
    },
    "broken": {"litellm_provider": "x", "mode": "chat", "input_cost_per_token": "n/a"},
}


def test_maps_and_scales_to_per_mtok():
    models = build_models(LITELLM)
    assert models["openai/gpt-4o"] == {"in_per_mtok_usd": 2.5, "out_per_mtok_usd": 10.0}
    # bare names get the provider prefix; already-prefixed keys are kept as-is
    assert "gemini/gemini-2.5-pro" in models
    assert models["gemini/gemini-2.5-pro"]["in_per_mtok_usd"] == 1.25


def test_skips_non_chat_sample_and_malformed():
    models = build_models(LITELLM)
    assert "sample_spec" not in models
    assert "openai/text-embedding-3-small" not in models  # embedding mode
    assert "x/broken" not in models  # non-numeric cost


def test_built_table_prices_a_real_call():
    table = build_table(LITELLM, "test://src", {"in_per_mtok_usd": 5.0, "out_per_mtok_usd": 15.0})
    pt = PriceTable(models=table["models"], default_rate=table["default_rate"])
    # 1000 in * 2.5 + 500 out * 10 = 7500 microUSD
    assert pt.cost_microusd("openai/gpt-4o", 1000, 500) == 7500
    assert table["version"]  # stamped
    assert table["_source"] == "test://src"
