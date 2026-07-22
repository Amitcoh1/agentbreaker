"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileUp, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { fromJson, type GraphSpec, toJson } from "@/lib/graphspec";
import { TEMPLATES } from "@/lib/templates";
import {
  deleteUserTemplate,
  loadUserTemplates,
  renameUserTemplate,
  saveUserTemplate,
  type UserTemplate,
} from "@/lib/userTemplates";

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

// Starter templates (built-in) + your own, saved locally. Load, rename, delete, export a single
// template, or import one from a file — all in the browser. Accounts/teams sync is a later issue.
export default function TemplatesMenu({
  current,
  onLoad,
}: {
  current: GraphSpec;
  onLoad: (s: GraphSpec) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<UserTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => setMine(loadUserTemplates());
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const load = (s: GraphSpec) => {
    onLoad(s);
    setOpen(false);
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    saveUserTemplate(n, current);
    setName("");
    setSaving(false);
    refresh();
  };
  const ren = (from: string) => {
    const to = window.prompt("Rename template", from);
    if (to && to.trim()) {
      renameUserTemplate(from, to);
      refresh();
    }
  };
  const importFile = (file: File) =>
    file.text().then((txt) => {
      const base = file.name.replace(/\.(template\.)?json$/i, "") || "imported";
      saveUserTemplate(base, fromJson(txt));
      refresh();
    });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-ink/5"
      >
        <LayoutTemplate className="h-4 w-4" /> Templates <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-glow">
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            Starter templates
          </div>
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => load(t.spec)}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-ink/5"
            >
              {t.name}
            </button>
          ))}

          <div className="mt-1 flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Your templates
            </span>
            <label className="cursor-pointer text-muted hover:text-fg" title="Import a template file">
              <FileUp className="h-3.5 w-3.5" />
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
              />
            </label>
          </div>
          {mine.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted">None yet — save the current canvas below.</div>
          )}
          {mine.map((t) => (
            <div key={t.name} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-ink/5">
              <button onClick={() => load(t.spec)} className="min-w-0 flex-1 truncate text-left text-sm">
                {t.name}
              </button>
              <button
                onClick={() => download(`${t.name}.template.json`, toJson(t.spec))}
                title="Export"
                className="text-muted hover:text-fg"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => ren(t.name)} title="Rename" className="text-muted hover:text-fg">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  deleteUserTemplate(t.name);
                  refresh();
                }}
                title="Delete"
                className="text-muted hover:text-brass"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <div className="mt-2 border-t border-border pt-2">
            {saving ? (
              <div className="flex gap-1 px-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder="Template name"
                  className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-ink"
                />
                <button onClick={save} className="rounded bg-fg px-2.5 py-1 text-sm font-medium text-bg">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSaving(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-ink/5"
              >
                <Plus className="h-4 w-4" /> Save current canvas as template…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
