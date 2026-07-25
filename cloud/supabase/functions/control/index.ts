// Breakerbox live control — Supabase Edge Function (Deno).
//
//   GET  ?run_id=...   the library polls; returns the oldest pending command and marks it
//                      applied. Auth: x-ingest-key (the library is trusted).
//   POST {run_id, command}   the dashboard issues pause|kill. Auth: x-control-key, so a
//                            public/unlisted run URL can't be used to kill an agent.
//
// Deploy:  supabase functions deploy control --no-verify-jwt
// Secrets: INGEST_KEY, CONTROL_KEY, SERVICE_ROLE_KEY, PROJECT_URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allow, clientIp } from "../_shared/throttle.ts";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("INGEST_KEY");
const CONTROL_KEY = Deno.env.get("CONTROL_KEY");

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

    // Resolve the run's owner once. The session-token path must match it; the global
    // CONTROL_KEY may only act on unowned (public) runs — it must never override the owner
    // of a private run, who controls it via their session.
    const { data: runRow } = await supabase
      .from("runs")
      .select("owner_id")
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
    if (
      !authorized &&
      CONTROL_KEY &&
      !runRow?.owner_id &&
      ctEq(req.headers.get("x-control-key") ?? "", CONTROL_KEY)
    ) {
      // ponytail: global key limited to public runs; a per-run control-key hash is the proper
      // upgrade for private-run CLI control (tracked as a follow-up issue).
      authorized = true;
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
