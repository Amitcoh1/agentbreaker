"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Settings2, Sparkles } from "lucide-react";
import type { SpecNode } from "@/lib/graphspec";
import {
  type AiSettings,
  loadAiSettings,
  providerNote,
  saveAiSettings,
  suggestCode,
} from "@/lib/aiSuggest";
import { MODEL_NAMES } from "@/lib/pricing";

const INPUT =
  "mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-ink";

// BYO-key node body. Everything here is client-side: the key persists only in this browser and is
// sent only to the provider you pick. Code you APPROVE is written to the node's `code` field and
// emitted verbatim into the generated Python; without approval the node keeps its TODO stub.
export default function AiSuggest({
  node,
  onApprove,
}: {
  node: SpecNode;
  onApprove: (code: string | undefined) => void;
}) {
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [desc, setDesc] = useState("");
  const [draft, setDraft] = useState(node.code ?? "");
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
    try {
      setDraft(await suggestCode(settings, node, desc));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (draft) {
      navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const approved = node.code != null;
  const dirty = draft.trim() !== (node.code ?? "").trim();

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
          <Sparkles className="h-3.5 w-3.5" /> Node body (your key)
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
              {/* #47: pick from the known price-table models to avoid typos; free-text still allowed
                  (custom / proxy models) via the datalist. */}
              <input
                className={INPUT}
                value={settings.model}
                onChange={(e) => set({ model: e.target.value })}
                list="bb-model-list"
              />
              <datalist id="bb-model-list">
                {MODEL_NAMES.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
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
        <p className="text-[11px] text-muted">
          Add your API key here or in{" "}
          <Link href="/dashboard/settings" className="underline hover:text-fg">
            Settings
          </Link>{" "}
          to enable.
        </p>
      )}
      {err && <p className="text-[11px] text-brass">⚠ {err}</p>}

      {/* Editable function body. Write it yourself or fill it with Suggest code, then Approve. */}
      <div className="rounded border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-2 py-1">
          <span className="text-[11px] text-muted">{node.id}(state) body</span>
          <button onClick={copy} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="# write or Suggest the function body, then Approve to include it in the generated Python"
          className="num max-h-64 w-full resize-y bg-transparent p-2 text-[11px] leading-relaxed outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onApprove(draft.trim() ? draft : undefined)}
          disabled={!dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink/10 px-2.5 py-1.5 text-sm font-medium text-fg hover:bg-ink/[0.16] disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> {approved ? "Update node body" : "Approve & include"}
        </button>
        {approved && (
          <button
            onClick={() => {
              onApprove(undefined);
              setDraft("");
            }}
            className="text-[11px] text-muted hover:text-bad"
          >
            remove
          </button>
        )}
      </div>
      {approved && !dirty && (
        <p className="text-[11px] text-primary">✓ Included in the generated Python.</p>
      )}
      {approved && dirty && (
        <p className="text-[11px] text-brass">Edited — click “Update node body” to re-include.</p>
      )}
    </div>
  );
}
