// Mirror of the Python price table for live cost estimates in the builder. The JSON is a copy
// of src/breakerbox/prices.json, kept in sync by `breakerbox update-prices` and locked by
// pricing.test.ts. Cost math matches pricing.py: microUSD = tokens_in*in + tokens_out*out.
import prices from "./prices.json";

type Rate = { in_per_mtok_usd: number; out_per_mtok_usd: number };
const MODELS = prices.models as Record<string, Rate>;

// A rough input-token assumption for build-time per-call estimates (real input varies per call).
export const INPUT_ASSUMPTION = 1000;

export const MODEL_NAMES = Object.keys(MODELS).sort();
export const isKnownModel = (m: string | undefined): boolean => !!m && m in MODELS;

/** Reserve-style estimate of one call's cost: assumed input + the model's max output. */
export function perCallUsd(model: string | undefined, maxTokens: number | undefined): number | null {
  if (!model || !(model in MODELS)) return null;
  const r = MODELS[model];
  const out = (maxTokens ?? 1024) * r.out_per_mtok_usd;
  return (INPUT_ASSUMPTION * r.in_per_mtok_usd + out) / 1_000_000;
}

export const usd = (n: number | null): string =>
  n == null ? "—" : Math.abs(n) >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
