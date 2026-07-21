"use client";

import { useState } from "react";
import { Check, Copy, Settings2, Sparkles } from "lucide-react";
import type { SpecNode } from "@/lib/graphspec";
import {
  type AiSettings,
  loadAiSettings,
  providerNote,
  saveAiSettings,
  suggestCode,
} from "@/lib/aiSuggest";

const INPUT =
  "mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-ink";

// BYO-key node suggestion. Everything here is client-side: the key persists only in this browser
// and is sent only to the provider you pick. The snippet is for copy/paste — it is never written
// into the graph spec, so codegen and the golden fixtures are untouched.
export default function AiSuggest({ node }: { node: SpecNode }) {
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [desc, setDesc] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAiSettings(next);
  };
  const note = providerNote(settings.provider, settings.baseUrl);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setCode(null);
    try {
      setCode(await suggestCode(settings, node, desc));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
          <Sparkles className="h-3.5 w-3.5" /> AI suggest (your key)
        </span>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-muted hover:text-fg"
          title="AI settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {showSettings && (
        <div className="space-y-2 rounded border border-border bg-surface/60 p-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-muted">provider</span>
              <select
                className={INPUT}
                value={settings.provider}
                onChange={(e) => set({ provider: e.target.value as AiSettings["provider"] })}
              >
                <option value="anthropic">Anthropic (browser-direct)</option>
                <option value="openai">OpenAI-compatible</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-muted">model</span>
              <input className={INPUT} value={settings.model} onChange={(e) => set({ model: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] text-muted">API key (stored only in this browser)</span>
            <input
              type="password"
              className={INPUT}
              value={settings.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder="sk-…"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted">base URL (optional — needed for an OpenAI proxy)</span>
            <input
              className={INPUT}
              value={settings.baseUrl ?? ""}
              onChange={(e) => set({ baseUrl: e.target.value || undefined })}
              placeholder="https://your-proxy.example/v1"
            />
          </label>
          <p className="text-[11px] leading-snug text-muted">
            Your key never leaves the browser except in the request to {settings.provider}. Breakerbox
            has no server in this path.
          </p>
        </div>
      )}

      <textarea
        rows={2}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder={`Describe what “${node.id}” should do…`}
        className="w-full resize-y rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-ink"
      />
      {note && <p className="text-[11px] text-brass">{note}</p>}
      <button
        onClick={run}
        disabled={busy || !settings.apiKey}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-ink/5 disabled:opacity-40"
      >
        <Sparkles className="h-3.5 w-3.5" /> {busy ? "Thinking…" : "Suggest code"}
      </button>
      {!settings.apiKey && !showSettings && (
        <p className="text-[11px] text-muted">Add your API key in settings to enable.</p>
      )}
      {err && <p className="text-[11px] text-brass">⚠ {err}</p>}

      {code != null && (
        <div className="rounded border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="text-[11px] text-muted">paste into the {node.id}(state) body</span>
            <button onClick={copy} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <pre className="num max-h-56 overflow-auto p-2 text-[11px] leading-relaxed">{code}</pre>
        </div>
      )}
    </div>
  );
}
