"use client";

import { useEffect, useState } from "react";
import { Download, KeyRound, Pause, Square } from "lucide-react";
import { controlUrl, isActive, sendCommand, type Run, type RunEvent } from "@/lib/supabase";

export default function RunControls({ run, events }: { run: Run; events: RunEvent[] }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setKey(localStorage.getItem("ab_control_key") ?? "");
  }, []);

  const saveKey = (v: string) => {
    setKey(v);
    localStorage.setItem("ab_control_key", v);
  };

  const issue = async (cmd: "pause" | "kill") => {
    setBusy(cmd);
    setMsg(null);
    try {
      await sendCommand(run.run_id, cmd, key);
      setMsg({ ok: true, text: `${cmd} sent — applies at the next hop boundary` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "failed" });
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ run, events }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${run.run_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = isActive(run);
  const canControl = active && !!key && !!controlUrl && !busy;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Live control</div>
        {!controlUrl && (
          <p className="mb-3 text-xs text-accent">
            NEXT_PUBLIC_CONTROL_URL is not set — commands are disabled.
          </p>
        )}
        {!active && (
          <p className="mb-3 text-xs text-muted">
            This run is {run.status ?? "not active"}; control applies to running agents.
          </p>
        )}
        <div className="flex gap-2">
          <button
            disabled={!canControl}
            onClick={() => issue("pause")}
            className="inline-flex items-center gap-2 rounded-lg bg-accent/15 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
          >
            <Pause className="h-4 w-4" /> Pause
          </button>
          <button
            disabled={!canControl}
            onClick={() => issue("kill")}
            className="inline-flex items-center gap-2 rounded-lg bg-bad/15 px-3 py-2 text-sm font-medium text-bad transition-colors hover:bg-bad/25 disabled:opacity-40"
          >
            <Square className="h-4 w-4" /> Kill
          </button>
        </div>
        {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-muted" /> Control key
          </div>
          <p className="mb-3 text-xs text-muted">
            Required to issue commands. Stored only in this browser (localStorage).
          </p>
          <input
            type="password"
            value={key}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="CONTROL_KEY"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="card p-4">
          <div className="mb-3 text-sm font-semibold">Export</div>
          <button
            onClick={download}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}
