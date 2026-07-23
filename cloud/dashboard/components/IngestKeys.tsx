"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ApiKey = { id: string; label: string; created_at: string; last_used_at: string | null };

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// A random opaque token. The plaintext is shown once and never stored — only its hash is.
function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "abk_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function IngestKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("api_keys")
      .select("id, label, created_at, last_used_at")
      .order("created_at", { ascending: false });
    setKeys((data ?? []) as ApiKey[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function issue() {
    setBusy(true);
    setErr(null);
    setFresh(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const key = generateKey();
      const key_hash = await sha256Hex(key);
      const { error } = await supabase
        .from("api_keys")
        .insert({ owner_id: user.id, key_hash, label: "default" });
      if (error) throw error;
      setFresh(key);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("api_keys").delete().eq("id", id);
    await load();
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4" /> Your ingest key
      </div>
      <p className="text-xs text-muted">
        Set this as <code className="text-fg">AGENTBREAKER_INGEST_KEY</code> where your agents run.
        Runs reported with it are private to your account. We store only a hash — copy it now, it is
        shown once.
      </p>

      {fresh && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="mb-1 text-xs text-muted">New key (shown once):</div>
          <div className="flex items-center gap-2">
            <code className="num flex-1 break-all text-sm text-fg">{fresh}</code>
            <button
              onClick={() => navigator.clipboard?.writeText(fresh)}
              className="shrink-0 rounded-md border border-border p-1.5 hover:bg-ink/5"
              aria-label="Copy key"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div>
              <div className="text-fg">{k.label}</div>
              <div className="text-xs text-muted">
                created {new Date(k.created_at).toLocaleDateString()}
                {k.last_used_at
                  ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                  : " · never used"}
              </div>
            </div>
            <button
              onClick={() => remove(k.id)}
              className="rounded-md p-1.5 text-muted hover:bg-ink/5 hover:text-bad"
              aria-label="Delete key"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {keys.length === 0 && <p className="text-xs text-muted">No keys yet.</p>}
      </div>

      {/* Brass is the single primary CTA in this card. */}
      <button
        onClick={issue}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-brass px-3 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" /> {busy ? "Creating…" : "Create ingest key"}
      </button>
      {err && <p className="text-xs text-bad">{err}</p>}
    </section>
  );
}
