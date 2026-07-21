import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Anon client — RLS limits reads to public runs. Fine for both server and browser.
export function supabase() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export type Run = {
  run_id: string;
  status: string | null;
  trip_reason: string | null;
  hops: number | null;
  budget_usd: number | null;
  spent_usd: number | null;
  projected_uncapped_usd: number | null;
  saved_usd: number | null;
  side_effects: string[];
  updated_at: string;
};

export type RunEvent = {
  seq: number;
  type: string;
  node: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  actual_microusd: number | null;
  cumulative_microusd: number | null;
  side_effecting: boolean;
};

export const money = (n: number | null | undefined) =>
  n == null ? "—" : Math.abs(n) >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
