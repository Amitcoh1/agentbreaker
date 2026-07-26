// Breakerbox event ingest — Supabase Edge Function (Deno).
//
// The library's report_to= sink POSTs { run_id, events[], summary? } here. We verify
// a shared secret and upsert with the service role (bypassing RLS). Events are
// idempotent on (run_id, seq), so retries and overlapping batches are safe.
//
// Deploy:  supabase functions deploy ingest --no-verify-jwt
// Secrets: supabase secrets set INGEST_KEY=... SERVICE_ROLE_KEY=... PROJECT_URL=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, clientIp } from "../_shared/throttle.ts";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("INGEST_KEY");

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time string compare — avoids a timing oracle on the shared secret.
function ctEq(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

const MAX_BODY_BYTES = 5_000_000;
const MAX_EVENTS = 5000;
const MAX_DETAIL_BYTES = 16_384;

// Personal ingest keys are `abk_` + 24 random bytes as hex (see IngestKeys.tsx). Validating the shape
// BEFORE hashing means a garbage key never triggers the api_keys lookup — this is what closes the
// unauthenticated DB-amplification: an attacker spraying random keys gets a flat 401, no DB work.
const PERSONAL_KEY = /^abk_[0-9a-f]{48}$/;

// Keep a single oversized event from bloating the DB; the stream stays intact.
function clampDetail(d: unknown): unknown {
  if (d == null) return {};
  try {
    if (JSON.stringify(d).length > MAX_DETAIL_BYTES) return { truncated: true };
  } catch {
    return { truncated: true };
  }
  return d;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413 });
  }

  // Per-instance flood guard, keyed by client IP. Generous so a busy sink never trips it.
  if (!allow(`ingest:${clientIp(req)}`)) {
    return new Response("rate limited", { status: 429, headers: { "retry-after": "1" } });
  }

  // Resolve the run owner from the ingest key: a personal key (stored hashed in api_keys) maps to a
  // user; the legacy shared INGEST_KEY ingests anonymous public runs (owner null); else 401. Only a
  // shape-valid personal key touches the DB (see PERSONAL_KEY) — junk keys short-circuit to 401.
  const presentedKey = req.headers.get("x-ingest-key") ?? "";
  let ownerId: string | null = null;
  if (PERSONAL_KEY.test(presentedKey)) {
    const keyHash = await sha256Hex(presentedKey);
    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("owner_id")
      .eq("key_hash", keyHash)
      .maybeSingle();
    if (keyRow) {
      ownerId = keyRow.owner_id as string;
      // best-effort last-used stamp
      supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("key_hash", keyHash)
        .then(() => {}, () => {});
    }
  }
  if (!ownerId && !(INGEST_KEY && ctEq(presentedKey, INGEST_KEY))) {
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

  if (body.events && (!Array.isArray(body.events) || body.events.length > MAX_EVENTS)) {
    return new Response("too many events", { status: 413 });
  }

  // Per-run control key (#45): store only its SHA-256 hash, set on the run's first sighting so the
  // `control` endpoint can authorize non-owner CLI pause/kill against this run alone.
  const controlKey = req.headers.get("x-control-key") ?? "";
  const controlKeyHash = controlKey ? await sha256Hex(controlKey) : null;

  // Create the parent run row on first sighting, stamped with its owner. Owned runs are private by
  // default (public=false); anonymous/legacy runs stay public (shareable link). ignoreDuplicates
  // keeps the original owner/visibility on later batches.
  await supabase
    .from("runs")
    .upsert(
      { run_id, owner_id: ownerId, public: ownerId === null, control_key_hash: controlKeyHash },
      { onConflict: "run_id", ignoreDuplicates: true },
    );

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
      detail: clampDetail(e.detail),
    }));
    const { error } = await supabase
      .from("events")
      .upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true });
    if (error) return new Response(error.message, { status: 500 });
  }

  if (body.summary) {
    const s = body.summary;
    // Update, don't upsert — the parent row already exists (created above with its real owner).
    // Scope the write to a run this key actually owns so a shared-key holder can't rewrite the
    // summary of someone else's private run.
    let q = supabase
      .from("runs")
      .update({
        status: s.status,
        trip_reason: s.trip_reason ?? null,
        hops: s.hops,
        budget_usd: s.budget_usd,
        spent_usd: s.spent_usd,
        projected_uncapped_usd: s.projected_uncapped_usd,
        saved_usd: s.saved_usd,
        side_effects: s.side_effects_fired ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", run_id);
    q = ownerId ? q.eq("owner_id", ownerId) : q.is("owner_id", null);
    const { error } = await q;
    if (error) return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
