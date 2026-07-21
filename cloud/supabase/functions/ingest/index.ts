// Breakerbox event ingest — Supabase Edge Function (Deno).
//
// The library's report_to= sink POSTs { run_id, events[], summary? } here. We verify
// a shared secret and upsert with the service role (bypassing RLS). Events are
// idempotent on (run_id, seq), so retries and overlapping batches are safe.
//
// Deploy:  supabase functions deploy ingest --no-verify-jwt
// Secrets: supabase secrets set INGEST_KEY=... SERVICE_ROLE_KEY=... PROJECT_URL=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("INGEST_KEY");

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (INGEST_KEY && req.headers.get("x-ingest-key") !== INGEST_KEY) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { run_id?: string; events?: any[]; summary?: any };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const run_id = body.run_id;
  if (!run_id) return new Response("missing run_id", { status: 400 });

  // Ensure the parent run row exists (FK target for events).
  await supabase.from("runs").upsert({ run_id }, { onConflict: "run_id", ignoreDuplicates: true });

  if (body.events?.length) {
    const rows = body.events.map((e) => ({
      run_id,
      seq: e.seq,
      ts: e.ts,
      type: e.type,
      node: e.node ?? null,
      parent: e.parent ?? null,
      model: e.model ?? null,
      tokens_in: e.tokens_in ?? null,
      tokens_out: e.tokens_out ?? null,
      estimate_microusd: e.estimate_microusd ?? null,
      actual_microusd: e.actual_microusd ?? null,
      cumulative_microusd: e.cumulative_microusd ?? null,
      side_effecting: e.side_effecting ?? false,
      detail: e.detail ?? {},
    }));
    const { error } = await supabase
      .from("events")
      .upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true });
    if (error) return new Response(error.message, { status: 500 });
  }

  if (body.summary) {
    const s = body.summary;
    const { error } = await supabase.from("runs").upsert(
      {
        run_id,
        status: s.status,
        trip_reason: s.trip_reason ?? null,
        hops: s.hops,
        budget_usd: s.budget_usd,
        spent_usd: s.spent_usd,
        projected_uncapped_usd: s.projected_uncapped_usd,
        saved_usd: s.saved_usd,
        side_effects: s.side_effects_fired ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id" },
    );
    if (error) return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
