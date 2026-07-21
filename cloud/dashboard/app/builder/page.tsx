"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { Copy, Download, FileUp, LayoutGrid, Plus, Save, X } from "lucide-react";
import BudgetTree from "./BudgetTree";
import BuilderNode from "./BuilderNode";
import Inspector from "./Inspector";
import { NodeIssues } from "./context";
import {
  EXAMPLE_SPEC,
  type GraphSpec,
  type SpecNode,
  fromJson,
  generate,
  toJson,
  validate,
} from "@/lib/graphspec";
import { type FlowNode, flowToSpec, newNode, nodeIssues, specToFlow } from "@/lib/graphflow";
import { MODEL_NAMES } from "@/lib/pricing";
import { TEMPLATES } from "@/lib/templates";

const nodeTypes = { ab: BuilderNode };
const STORAGE = "ab_builder_spec";
const initial = specToFlow(EXAMPLE_SPEC);

const btn = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
    on ? "bg-brass text-paper hover:bg-brassdark" : "cursor-not-allowed bg-ink/5 text-muted"
  }`;
const ghost = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-sm ${
    on ? "hover:bg-ink/5" : "cursor-not-allowed text-muted"
  }`;

export default function BuilderPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [config, setConfig] = useState<GraphSpec["config"]>(EXAMPLE_SPEC.config);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE) : null;
    if (!saved) return;
    try {
      const s = fromJson(saved);
      const f = specToFlow(s);
      setNodes(f.nodes);
      setEdges(f.edges);
      setConfig(s.config);
    } catch {
      /* ignore malformed saved state */
    }
  }, [setNodes, setEdges]);

  const spec = useMemo(() => flowToSpec(nodes, edges, config), [nodes, edges, config]);
  const result = useMemo(() => validate(spec), [spec]);
  const issues = useMemo(() => nodeIssues(spec), [spec]);
  const canExport = result.ok;

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#1f2328" } }, eds)),
    [setEdges],
  );

  const addNode = (type: SpecNode["type"]) => {
    const s = newNode(type, new Set(nodes.map((n) => n.id)));
    setNodes((nds) => [
      ...nds,
      { id: s.id, type: "ab", position: { x: 140, y: 40 + nds.length * 24 }, data: { spec: s } },
    ]);
    setSelNode(s.id);
    setSelEdge(null);
  };

  const patchNode = (id: string, patch: Partial<SpecNode>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { spec: { ...n.data.spec, ...patch } } } : n)),
    );

  const renameNode = (oldId: string, newId: string) => {
    if (!newId || newId === oldId || nodes.some((n) => n.id === newId)) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === oldId ? { ...n, id: newId, data: { spec: { ...n.data.spec, id: newId } } } : n,
      ),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        source: e.source === oldId ? newId : e.source,
        target: e.target === oldId ? newId : e.target,
      })),
    );
    if (selNode === oldId) setSelNode(newId);
  };

  const duplicateNode = (id: string) => {
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    const ids = new Set(nodes.map((n) => n.id));
    let nid = `${id}_copy`;
    let i = 1;
    while (ids.has(nid)) nid = `${id}_copy${i++}`;
    setNodes((nds) => [
      ...nds,
      {
        id: nid,
        type: "ab",
        position: { x: src.position.x + 48, y: src.position.y + 48 },
        data: { spec: { ...src.data.spec, id: nid } },
      },
    ]);
    setSelNode(nid);
  };

  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelNode(null);
  };

  const load = (s: GraphSpec) => {
    const f = specToFlow(s);
    setNodes(f.nodes);
    setEdges(f.edges);
    setConfig(s.config);
    setSelNode(null);
    setSelEdge(null);
  };

  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedNode = nodes.find((n) => n.id === selNode);
  const selectedEdge = edges.find((e) => e.id === selEdge);

  return (
    <div className="flex h-dvh flex-col">
      <datalist id="ab-models">
        {MODEL_NAMES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-2 font-semibold">Builder</h1>
        <button onClick={() => setCode(generate(spec))} disabled={!canExport} className={btn(canExport)}>
          Generate Python
        </button>
        <button
          onClick={() => download("workflow.py", generate(spec), "text/x-python")}
          disabled={!canExport}
          className={ghost(canExport)}
        >
          <Download className="h-4 w-4" /> .py
        </button>
        <button
          onClick={() => download("graph.json", toJson(spec), "application/json")}
          className={ghost(true)}
        >
          <Download className="h-4 w-4" /> spec.json
        </button>
        <label className={`${ghost(true)} cursor-pointer`}>
          <FileUp className="h-4 w-4" /> Import
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then((t) => load(fromJson(t)))}
          />
        </label>
        <button onClick={() => load(spec)} className={ghost(true)} title="Re-layout from the graph">
          <LayoutGrid className="h-4 w-4" /> Auto-layout
        </button>
        <select
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          value=""
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.name === e.target.value);
            if (t) load(t.spec);
            e.currentTarget.value = "";
          }}
        >
          <option value="">Templates…</option>
          {TEMPLATES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button onClick={() => localStorage.setItem(STORAGE, toJson(spec))} className={ghost(true)}>
          <Save className="h-4 w-4" /> Save
        </button>
        {!canExport && (
          <span className="ml-auto text-xs font-medium text-bad">
            {result.errors.length} error(s) — fix to export
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-40 shrink-0 space-y-2 border-r border-border p-3">
          <div className="text-xs font-semibold text-muted">Add node</div>
          {(["start", "model", "tool", "router", "end"] as const).map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="flex w-full items-center gap-2 rounded border border-border px-2 py-1.5 text-sm capitalize hover:bg-ink/5"
            >
              <Plus className="h-3.5 w-3.5" /> {t}
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <NodeIssues.Provider value={issues}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={() => setSelNode(null)}
              onNodeClick={(_, n) => {
                setSelNode(n.id);
                setSelEdge(null);
              }}
              onEdgeClick={(_, e) => {
                setSelEdge(e.id);
                setSelNode(null);
              }}
              onPaneClick={() => {
                setSelNode(null);
                setSelEdge(null);
              }}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e6e3da" gap={20} />
              <Controls showInteractive={false} />
              <MiniMap pannable className="!bg-surface" nodeColor={() => "#1f2328"} />
            </ReactFlow>
          </NodeIssues.Provider>
        </div>

        <div className="w-80 shrink-0 space-y-3 overflow-y-auto border-l border-border p-3">
          <BudgetTree spec={spec} />
          <GuardConfig
            config={config ?? {}}
            onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))}
          />
          {selectedNode && (
            <Inspector
              key={selectedNode.id}
              node={selectedNode.data.spec}
              onChange={(p) => patchNode(selectedNode.id, p)}
              onRename={(id) => renameNode(selectedNode.id, id)}
              onDelete={() => deleteNode(selectedNode.id)}
              onDuplicate={() => duplicateNode(selectedNode.id)}
            />
          )}
          {selectedEdge && (
            <EdgeInspector
              label={String(selectedEdge.label ?? "")}
              onChange={(l) =>
                setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, label: l } : e)))
              }
              onDelete={() => {
                setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
                setSelEdge(null);
              }}
            />
          )}
          <Messages result={result} />
        </div>
      </div>

      {code !== null && <CodeModal code={code} onClose={() => setCode(null)} />}
    </div>
  );
}

function GuardConfig({
  config,
  onChange,
}: {
  config: NonNullable<GraphSpec["config"]>;
  onChange: (patch: NonNullable<GraphSpec["config"]>) => void;
}) {
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const inp =
    "mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary";
  return (
    <div className="card space-y-2 p-4">
      <div className="text-sm font-semibold">Guard config</div>
      <label className="block">
        <span className="text-xs text-muted">budget_usd</span>
        <input
          type="number"
          step="0.01"
          className={inp}
          value={config.budget_usd ?? ""}
          onChange={(e) => onChange({ budget_usd: num(e.target.value) })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-muted">max_hops</span>
          <input
            type="number"
            className={inp}
            value={config.max_hops ?? ""}
            onChange={(e) => onChange({ max_hops: num(e.target.value) })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">ttl_seconds</span>
          <input
            type="number"
            className={inp}
            value={config.ttl_seconds ?? ""}
            onChange={(e) => onChange({ ttl_seconds: num(e.target.value) })}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted">velocity_usd_per_min</span>
        <input
          type="number"
          step="0.1"
          className={inp}
          value={config.velocity_usd_per_min ?? ""}
          onChange={(e) => onChange({ velocity_usd_per_min: num(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">on_trip</span>
        <select
          className={inp}
          value={config.on_trip ?? "pause"}
          onChange={(e) => onChange({ on_trip: e.target.value })}
        >
          <option value="pause">pause</option>
          <option value="kill">kill</option>
        </select>
      </label>
    </div>
  );
}

function EdgeInspector({
  label,
  onChange,
  onDelete,
}: {
  label: string;
  onChange: (l: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Edge</div>
        <button onClick={onDelete} className="text-xs text-bad hover:underline">
          delete
        </button>
      </div>
      <label className="block">
        <span className="text-xs text-muted">condition (router branch label)</span>
        <input
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
          value={label}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function Messages({ result }: { result: ReturnType<typeof validate> }) {
  if (!result.errors.length && !result.warnings.length && !result.notes.length) {
    return <div className="card p-3 text-xs text-good">✓ valid</div>;
  }
  return (
    <div className="card space-y-1 p-3 text-xs">
      {result.errors.map((e, i) => (
        <div key={`e${i}`} className="text-bad">✗ {e}</div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={`w${i}`} className="text-accent">⚠ {w}</div>
      ))}
      {result.notes.map((n, i) => (
        <div key={`n${i}`} className="text-muted">ℹ {n}</div>
      ))}
    </div>
  );
}

function CodeModal({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="card flex max-h-[80dvh] w-full max-w-3xl flex-col p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Generated Python — runs on your machine</div>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(code)}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-sm hover:bg-ink/5"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button onClick={onClose} className="rounded border border-border p-1 hover:bg-ink/5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="num overflow-auto rounded bg-bg p-3 text-xs leading-relaxed">{code}</pre>
      </div>
    </div>
  );
}
