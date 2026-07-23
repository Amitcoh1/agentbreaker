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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // Library polls for a pending command.
  if (req.method === "GET") {
    if (INGEST_KEY && req.headers.get("x-ingest-key") !== INGEST_KEY) {
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
    let body: { run_id?: string; command?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (!body.run_id || !["pause", "kill"].includes(body.command ?? "")) {
      return json({ error: "run_id and command (pause|kill) required" }, 400);
    }

    let authorized = false;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (token) {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        const { data: runRow } = await supabase
          .from("runs")
          .select("owner_id")
          .eq("run_id", body.run_id)
          .maybeSingle();
        if (runRow && runRow.owner_id === user.id) authorized = true;
      }
    }
    if (!authorized && CONTROL_KEY && req.headers.get("x-control-key") === CONTROL_KEY) {
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
