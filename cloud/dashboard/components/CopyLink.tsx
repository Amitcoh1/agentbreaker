"use client";

import { useState } from "react";

// Copies a public, read-only share link to a run (#10). Only rendered for public runs, so the
// link always resolves; the /r/[runId] route is RLS-gated to public runs anyway.
export default function CopyLink({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${runId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (no HTTPS / permission) — no-op */
    }
  };
  return (
    <button
      onClick={copy}
      title="Copy a public, read-only link to this run"
      className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-ink/5 hover:text-fg"
    >
      {copied ? "Copied ✓" : "Copy share link"}
    </button>
  );
}
