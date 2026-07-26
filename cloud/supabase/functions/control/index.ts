// Breakerbox live control — Supabase Edge Function (Deno).
//
//   GET  ?run_id=...   the library polls; returns the oldest pending command and marks it
//                      applied. Auth: x-ingest-key (the library is trusted).
//   POST {run_id, command}   the dashboard (owner session) or CLI issues pause|kill. Auth: the
//                            owner's session token, or x-control-key matching the run's per-run
//                            control-key hash (#45) — never a global master key.
//
// Deploy:  supabase functions deploy control --no-verify-jwt
// Secrets: INGEST_KEY, SERVICE_ROLE_KEY, PROJECT_URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, clientIp } from "../_shared/throttle.ts";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("INGEST_KEY");

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-control-key, x-ingest-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

// Constant-time string compare — avoids a timing oracle on the shared secrets.
function ctEq(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // Library polls for a pending command.
  if (req.method === "GET") {
    if (INGEST_KEY && !ctEq(req.headers.get("x-ingest-key") ?? "", INGEST_KEY)) {
      return json({ error: "unauthorized" }, 401);
    }
    const run_id = url.searchParams.get("run_id");
    if (!run_id) return json({ error: "missing run_id" }, 400);

    const { data } = await supabase
      .from("commands")
      .select("id, command")
      .eq("run_id", run_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    const cmd = data?.[0];
    if (!cmd) return json({ command: null });

    await supabase
      .from("commands")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", cmd.id);
    return json({ command: cmd.command });
  }

  // Dashboard issues a command: the authenticated owner of the run, or a legacy control key.
  if (req.method === "POST") {
    // Throttle the write path per IP — it runs auth.getUser + inserts, and a human clicking
    // pause/kill is nowhere near this. (The GET poll is exempt: it's the trusted, high-frequency
    // library path, already authenticated by the shared key before any query.)
    if (!allow(`control:${clientIp(req)}`)) return json({ error: "rate limited" }, 429);

    let body: { run_id?: string; command?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (!body.run_id || !["pause", "kill"].includes(body.command ?? "")) {
      return json({ error: "run_id and command (pause|kill) required" }, 400);
    }

    // Resolve the run's owner + per-run control-key hash once. The session-token path must match the
    // owner; a non-owner caller is authorized only by presenting the key whose hash was stored for
    // THIS run at ingest (#45) — so a leaked key can never act as a global master kill switch.
    const { data: runRow } = await supabase
      .from("runs")
      .select("owner_id, control_key_hash")
      .eq("run_id", body.run_id)
      .maybeSingle();

    let authorized = false;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (token) {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user && runRow && runRow.owner_id === user.id) authorized = true;
    }
    if (!authorized && runRow?.control_key_hash) {
      // Per-run control key: authorize iff the presented key hashes to the one stored for this run.
      const presented = req.headers.get("x-control-key") ?? "";
      if (presented && ctEq(await sha256Hex(presented), runRow.control_key_hash)) {
        authorized = true;
      }
    }
    if (!authorized) return json({ error: "unauthorized" }, 401);

    const { error } = await supabase
      .from("commands")
      .insert({ run_id: body.run_id, command: body.command });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
});
