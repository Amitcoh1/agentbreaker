"use client";

import { useEffect, useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import { type AiSettings, loadAiSettings, providerNote, saveAiSettings } from "@/lib/aiSuggest";

const INPUT =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

export default function SettingsPage() {
  const [ai, setAi] = useState<AiSettings>(() => ({ provider: "anthropic", model: "", apiKey: "" }));
  const [controlKey, setControlKey] = useState("");
  const [saved, setSaved] = useState(false);

  // Read on mount (localStorage is client-only). These never leave the browser.
  useEffect(() => {
    setAi(loadAiSettings());
    setControlKey(localStorage.getItem("ab_control_key") ?? "");
  }, []);

  const setAiField = (patch: Partial<AiSettings>) => {
    const next = { ...ai, ...patch };
    setAi(next);
    saveAiSettings(next);
    flash();
  };
  const setKey = (v: string) => {
    setControlKey(v);
    localStorage.setItem("ab_control_key", v);
    flash();
  };
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1000);
  };

  const note = providerNote(ai.provider, ai.baseUrl);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted">
            Everything here is stored only in this browser. Keys are sent only to the provider you
            pick — never to a Breakerbox server.
          </p>
        </div>
        {saved && <span className="chip bg-ink/[0.08] text-fg">saved</span>}
      </header>

      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> AI code suggestions
        </div>
        <p className="text-xs text-muted">
          Used by the “Suggest code” helper on model, tool and router nodes in the builder.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-muted">provider</span>
            <select
              className={INPUT}
              value={ai.provider}
              onChange={(e) => setAiField({ provider: e.target.value as AiSettings["provider"] })}
            >
              <option value="anthropic">Anthropic (browser-direct)</option>
              <option value="openai">OpenAI-compatible</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">model</span>
            <input className={INPUT} value={ai.model} onChange={(e) => setAiField({ model: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted">API key</span>
          <input
            type="password"
            autoComplete="off"
            className={INPUT}
            value={ai.apiKey}
            onChange={(e) => setAiField({ apiKey: e.target.value })}
            placeholder="sk-…"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">base URL (optional — needed for an OpenAI proxy)</span>
          <input
            className={INPUT}
            value={ai.baseUrl ?? ""}
            onChange={(e) => setAiField({ baseUrl: e.target.value || undefined })}
            placeholder="https://your-proxy.example/v1"
          />
        </label>
        {note && <p className="text-xs text-brass">{note}</p>}
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> Run control key
        </div>
        <p className="text-xs text-muted">
          Required to pause/kill a running agent from the Controls tab of a run — the{" "}
          <code className="text-fg">CONTROL_KEY</code> you configured on the guard.
        </p>
        <label className="block">
          <span className="text-xs text-muted">control key</span>
          <input
            type="password"
            autoComplete="off"
            className={INPUT}
            value={controlKey}
            onChange={(e) => setKey(e.target.value)}
            placeholder="CONTROL_KEY"
          />
        </label>
      </section>
    </div>
  );
}
