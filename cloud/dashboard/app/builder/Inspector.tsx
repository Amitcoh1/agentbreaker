"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import type { SpecNode } from "@/lib/graphspec";
import { isKnownModel, perCallUsd, usd } from "@/lib/pricing";

const INPUT =
  "mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

export default function Inspector({
  node,
  onChange,
  onRename,
  onDelete,
  onDuplicate,
}: {
  node: SpecNode;
  onChange: (patch: Partial<SpecNode>) => void;
  onRename: (id: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [id, setId] = useState(node.id);
  const commitId = () => {
    const clean = id.trim();
    if (clean && clean !== node.id) onRename(clean);
    else setId(node.id);
  };
  const perCall = node.type === "model" ? perCallUsd(node.model, node.max_tokens) : null;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold capitalize">{node.type}</div>
        <div className="flex gap-3">
          <button onClick={onDuplicate} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <Copy className="h-3.5 w-3.5" /> duplicate
          </button>
          {node.type !== "start" && node.type !== "end" && (
            <button onClick={onDelete} className="text-xs text-bad hover:underline">
              delete
            </button>
          )}
        </div>
      </div>

      <Field label="id (becomes the function name)">
        <input
          className={INPUT}
          value={id}
          onChange={(e) => setId(e.target.value)}
          onBlur={commitId}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </Field>

      {node.type === "model" && (
        <>
          <Field label="model">
            <input
              className={INPUT}
              list="ab-models"
              value={node.model ?? ""}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="openai/gpt-4o"
            />
          </Field>
          {node.model && !isKnownModel(node.model) && (
            <p className="text-[11px] text-accent">
              Not in the price table — the guard will need unknown_model=&quot;default_rate&quot;
              or an override, and no cost estimate is shown.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="max_tokens">
              <input
                type="number"
                className={INPUT}
                value={node.max_tokens ?? ""}
                onChange={(e) => onChange({ max_tokens: numOrUndef(e.target.value) })}
              />
            </Field>
            <Field label="sub_budget_usd">
              <input
                type="number"
                step="0.01"
                className={INPUT}
                value={node.sub_budget_usd ?? ""}
                onChange={(e) => onChange({ sub_budget_usd: numOrUndef(e.target.value) })}
              />
            </Field>
          </div>
          {perCall != null && (
            <p className="text-[11px] text-primary">
              ≈{usd(perCall)}/call
              {node.sub_budget_usd
                ? ` · this node's budget buys ~${Math.floor((node.sub_budget_usd ?? 0) / perCall)} calls`
                : ""}
            </p>
          )}
        </>
      )}

      {node.type === "tool" && (
        <>
          <Field label="name">
            <input
              className={INPUT}
              value={node.name ?? ""}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!node.side_effecting}
              onChange={(e) => onChange({ side_effecting: e.target.checked })}
            />
            side_effecting
          </label>
        </>
      )}

      {node.type === "router" && (
        <Field label="condition (routing fn name)">
          <input
            className={INPUT}
            value={node.condition ?? ""}
            onChange={(e) => onChange({ condition: e.target.value })}
          />
        </Field>
      )}

      {(node.type === "start" || node.type === "end") && (
        <p className="text-xs text-muted">Nothing else to configure.</p>
      )}
    </div>
  );
}
