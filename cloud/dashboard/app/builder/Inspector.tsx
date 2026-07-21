"use client";

import type { ReactNode } from "react";
import type { SpecNode } from "@/lib/graphspec";

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
  onDelete,
}: {
  node: SpecNode;
  onChange: (patch: Partial<SpecNode>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">
          <span className="capitalize">{node.type}</span> · {node.id}
        </div>
        {node.type !== "start" && node.type !== "end" && (
          <button onClick={onDelete} className="text-xs text-bad hover:underline">
            delete
          </button>
        )}
      </div>

      {node.type === "model" && (
        <>
          <Field label="model">
            <input
              className={INPUT}
              value={node.model ?? ""}
              onChange={(e) => onChange({ model: e.target.value })}
            />
          </Field>
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
        <p className="text-xs text-muted">Nothing to configure.</p>
      )}
    </div>
  );
}
