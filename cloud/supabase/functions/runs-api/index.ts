// Breakerbox read-only Data API — Supabase Edge Function (Deno).
//
//   GET ?limit=50        list your runs (newest first)
//   GET ?run_id=...      one run + its events (the receipt)
//
// Auth (either): x-ingest-key: abk_...  OR  Authorization: Bearer <session token>. Both resolve to
// an account; the API only ever returns that account's runs. Read-only: it never runs a graph and
// never touches provider keys. The service role is used to read, then filtered by owner_id.
//
// Deploy:  supabase functions deploy runs-api --no-verify-jwt
// Secrets: SERVICE_ROLE_KEY, PROJECT_URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-ingest-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Resolve the caller's account from a personal ingest key or a session bearer token.
async function resolveOwner(req: Request): Promise<string | null> {
  const key = req.headers.get("x-ingest-key");
  if (key) {
    const { data } = await supabase
      .from("api_keys")
      .select("owner_id")
      .eq("key_hash", await sha256Hex(key))
      .maybeSingle();
    if (data) return data.owner_id as string;
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
  if (token) {
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (user) return user.id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const owner = await resolveOwner(req);
  if (!owner) {
    return json({ error: "unauthorized — send x-ingest-key or an Authorization bearer token" }, 401);
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");

  // One run + its events (the receipt).
  if (runId) {
    const { data: run } = await supabase
      .from("runs")
      .select("*")
      .eq("run_id", runId)
      .eq("owner_id", owner)
      .maybeSingle();
    if (!run) return json({ error: "not found" }, 404);
    const { data: events } = await supabase
      .from("events")
      .select("*")
      .eq("run_id", runId)
      .order("seq", { ascending: true });
    return json({ run, events: events ?? [] });
  }

  // List your runs.
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
  const { data: runs } = await supabase
    .from("runs")
    .select("*")
    .eq("owner_id", owner)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return json({ runs: runs ?? [] });
});
