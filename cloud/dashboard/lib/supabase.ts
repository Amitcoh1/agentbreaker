import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Control edge function endpoint (…/functions/v1/control). Used to issue pause/kill.
export const controlUrl = process.env.NEXT_PUBLIC_CONTROL_URL ?? "";

// Anon client — RLS limits reads to public runs. Fine for both server and browser.
export function supabase() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export type RunStatus = "completed" | "killed" | "paused" | "running" | null;

export type Run = {
  run_id: string;
  status: RunStatus;
  trip_reason: string | null;
  hops: number | null;
  budget_usd: number | null;
  spent_usd: number | null;
  projected_uncapped_usd: number | null;
  saved_usd: number | null;
  side_effects: string[];
  public: boolean;
  created_at: string;
  updated_at: string;
};

export type RunEvent = {
  seq: number;
  type: string;
  node: string | null;
  parent: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  estimate_microusd: number | null;
  actual_microusd: number | null;
  cumulative_microusd: number | null;
  side_effecting: boolean;
  detail: Record<string, unknown> | null;
};

export type SpendByModel = { model: string; calls: number; spent_microusd: number };
export type SpendByNode = { node: string; hops: number; spent_microusd: number };
export type DailySpend = { day: string; runs: number; spent_usd: number; saved_usd: number };

// The dashboard treats a run with no terminal status yet as "running".
export const displayStatus = (r: Pick<Run, "status">): Exclude<RunStatus, null> =>
  (r.status as Exclude<RunStatus, null>) ?? "running";

export const isActive = (r: Pick<Run, "status">) => displayStatus(r) === "running";

// POST a pause/kill command to the control edge function (needs the control key).
export async function sendCommand(runId: string, command: "pause" | "kill", key: string) {
  const res = await fetch(controlUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-control-key": key },
    body: JSON.stringify({ run_id: runId, command }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}
