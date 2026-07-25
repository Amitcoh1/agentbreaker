// TS mirror of breakerbox/graphspec.py + codegen.py. It MUST stay byte-identical to the
// Python side — the shared golden fixtures in tests/fixtures/graphspec/ lock both the codegen
// output and the validator messages (see graphspec.test.ts). No server: the browser generates
// the Python itself. Number formatting is field-aware (JSON/JS can't tell 5.0 from 5).
import { ceilingComment, costCeiling } from "./costCeiling";

export type NodeType = "start" | "end" | "model" | "tool" | "router";
export type SideEffectClass = "read" | "network" | "write" | "destructive";

export interface SpecNode {
  id: string;
  type: NodeType;
  model?: string;
  max_tokens?: number;
  sub_budget_usd?: number;
  name?: string;
  side_effecting?: boolean;
  side_effect_class?: SideEffectClass;
  condition?: string;
  code?: string;
  [k: string]: unknown;
}
export interface SpecEdge {
  source: string;
  target: string;
  condition?: string;
  [k: string]: unknown;
}
export interface SpecConfig {
  budget_usd?: number;
  max_hops?: number;
  ttl_seconds?: number;
  velocity_usd_per_min?: number;
  on_trip?: string;
  [k: string]: unknown;
}
export interface GraphSpec {
  version?: string;
  config?: SpecConfig;
  nodes?: SpecNode[];
  edges?: SpecEdge[];
  [k: string]: unknown;
}
export interface ValidationResult {
  errors: string[];
  warnings: string[];
  notes: string[];
  ok: boolean;
}

const SPEC_VERSION = "1";
const NODE_TYPES = ["start", "end", "model", "tool", "router"];
const NODE_FIELDS: Record<string, string[]> = {
  start: [],
  end: [],
  model: ["model", "max_tokens", "sub_budget_usd", "code"],
  tool: ["name", "side_effecting", "side_effect_class", "code"],
  router: ["condition", "code"],
};
// A tool's blast radius, coarsest-first. `destructive` is the one codegen acts on: it wires a
// human-approval gate (interrupt_before) into the compiled graph. `read` means no side effect.
const SIDE_EFFECT_CLASSES = ["read", "network", "write", "destructive"];
const CONFIG_FIELDS = ["budget_usd", "max_hops", "ttl_seconds", "velocity_usd_per_min", "on_trip"];
const EDGE_FIELDS = ["source", "target", "condition"];
const TOP_FIELDS = ["version", "config", "nodes", "edges"];
const ON_TRIP = ["pause", "kill"];
const EPS = 1e-9;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// Python sorted(set) repr, e.g. ['a', 'b']
const pylist = (a: string[]) => "[" + [...a].sort().map((x) => `'${x}'`).join(", ") + "]";

// ---------- validate ----------
export function validate(spec: GraphSpec): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return { errors: ["Spec must be a JSON object."], warnings, notes, ok: false };
  }

  const unknownTop = Object.keys(spec).filter((k) => !TOP_FIELDS.includes(k));
  if (unknownTop.length) {
    errors.push(
      `Unknown top-level field(s): ${pylist(unknownTop)}. Expected ${pylist(TOP_FIELDS)}.`,
    );
  }
  if (String(spec.version) !== SPEC_VERSION) {
    errors.push(
      `Unsupported spec version ${py(spec.version)}; this build understands version '${SPEC_VERSION}'.`,
    );
  }

  validateConfig(spec.config, errors);

  let nodes = spec.nodes;
  let edges = spec.edges;
  if (!Array.isArray(nodes)) {
    errors.push("Spec needs a 'nodes' array.");
    nodes = [];
  }
  if (!Array.isArray(edges)) {
    errors.push("Spec needs an 'edges' array.");
    edges = [];
  }

  const ids = validateNodes(nodes, errors, warnings);
  const goodEdges = validateEdges(edges, ids, errors);
  validateBudget(spec.config ?? {}, nodes, errors);
  validateRouters(nodes, edges, errors);
  validateConnectivity(nodes, goodEdges, ids, errors);
  detectCycles(goodEdges, notes);

  return { errors, warnings, notes, ok: errors.length === 0 };
}

// python repr of a scalar for a couple of messages
const py = (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v));

function validateConfig(config: unknown, errors: string[]): void {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    errors.push("Spec needs a 'config' object with at least budget_usd.");
    return;
  }
  const c = config as SpecConfig;
  const unknown = Object.keys(c).filter((k) => !CONFIG_FIELDS.includes(k));
  if (unknown.length) {
    errors.push(`config has unknown field(s) ${pylist(unknown)}; expected ${pylist(CONFIG_FIELDS)}.`);
  }
  if (!isNum(c.budget_usd) || (c.budget_usd as number) <= 0) {
    errors.push("config.budget_usd is required and must be a positive number.");
  }
  if (c.on_trip !== undefined && !ON_TRIP.includes(c.on_trip)) {
    errors.push(`config.on_trip must be 'pause' or 'kill' (got ${py(c.on_trip)}).`);
  }
  if (c.max_hops !== undefined && (!Number.isInteger(c.max_hops) || (c.max_hops as number) <= 0)) {
    errors.push("config.max_hops must be a positive integer.");
  }
  for (const k of ["ttl_seconds", "velocity_usd_per_min"] as const) {
    const v = c[k];
    if (v !== undefined && (!isNum(v) || (v as number) < 0)) {
      errors.push(`config.${k} must be a number ≥ 0.`);
    }
  }
}

function validateNodes(nodes: SpecNode[], errors: string[], warnings: string[]): Set<string> {
  const ids = new Set<string>();
  let starts = 0;
  let ends = 0;
  nodes.forEach((n, i) => {
    if (typeof n !== "object" || n === null) {
      errors.push(`Node #${i} must be an object.`);
      return;
    }
    const nid = n.id;
    if (typeof nid !== "string" || !nid) {
      errors.push(`Node #${i} needs a non-empty string 'id'.`);
      return;
    }
    if (ids.has(nid)) errors.push(`Duplicate node id '${nid}'.`);
    ids.add(nid);
    const t = n.type;
    if (!NODE_TYPES.includes(t)) {
      errors.push(`Node '${nid}' has unknown type ${py(t)} (expected ${pylist(NODE_TYPES)}).`);
      return;
    }
    const extra = Object.keys(n).filter((k) => k !== "id" && k !== "type" && !NODE_FIELDS[t].includes(k));
    if (extra.length) {
      errors.push(
        `Node '${nid}' (type ${t}) has unknown field(s) ${pylist(extra)}; ` +
          "unknown fields are rejected for forward-compatibility.",
      );
    }
    if (t === "start") starts++;
    else if (t === "end") ends++;
    else if (t === "model") {
      if (!n.model) errors.push(`Model node '${nid}' needs a 'model' (e.g. 'openai/gpt-4o').`);
      if (!("max_tokens" in n)) {
        warnings.push(
          `Model node '${nid}' has no max_tokens: the reserve uses a default upper ` +
            "bound, so the budget cap may be enforced one hop late (the overshoot rule). " +
            "Declare max_tokens to stop strictly under budget.",
        );
      }
      if (n.sub_budget_usd !== undefined && (!isNum(n.sub_budget_usd) || n.sub_budget_usd < 0)) {
        errors.push(`Model node '${nid}' sub_budget_usd must be a number ≥ 0.`);
      }
    } else if (t === "tool") {
      if (!n.name) errors.push(`Tool node '${nid}' needs a 'name'.`);
      if (n.side_effecting !== undefined && typeof n.side_effecting !== "boolean") {
        errors.push(`Tool node '${nid}' side_effecting must be true or false.`);
      }
      if (n.side_effect_class !== undefined && !SIDE_EFFECT_CLASSES.includes(n.side_effect_class)) {
        errors.push(`Tool node '${nid}' side_effect_class must be one of ${pylist(SIDE_EFFECT_CLASSES)}.`);
      }
    }
  });
  if (starts !== 1) errors.push(`A workflow needs exactly one 'start' node (found ${starts}).`);
  if (ends < 1) errors.push("A workflow needs at least one 'end' node (found 0).");
  return ids;
}

type GoodEdge = [string, string, unknown];

function validateEdges(edges: SpecEdge[], ids: Set<string>, errors: string[]): GoodEdge[] {
  const good: GoodEdge[] = [];
  edges.forEach((e, i) => {
    if (typeof e !== "object" || e === null) {
      errors.push(`Edge #${i} must be an object.`);
      return;
    }
    const extra = Object.keys(e).filter((k) => !EDGE_FIELDS.includes(k));
    if (extra.length) errors.push(`Edge #${i} has unknown field(s) ${pylist(extra)}.`);
    const { source: s, target: t } = e;
    if (s === undefined || t === undefined) {
      errors.push(`Edge #${i} needs both 'source' and 'target'.`);
      return;
    }
    const missing = [s, t].filter((x) => !ids.has(x));
    if (missing.length) {
      errors.push(`Edge '${s}' → '${t}' references node(s) that don't exist: ${pylist(missing)}.`);
    } else {
      good.push([s, t, e.condition]);
    }
  });
  return good;
}

function validateBudget(config: SpecConfig, nodes: SpecNode[], errors: string[]): void {
  const budget = config.budget_usd;
  if (!isNum(budget) || budget <= 0) return;
  const total = nodes
    .filter((n) => n.type === "model" && isNum(n.sub_budget_usd))
    .reduce((a, n) => a + (n.sub_budget_usd as number), 0);
  if (total > budget + EPS) {
    errors.push(
      `Budget over-allocated: node sub-budgets total $${total.toFixed(2)} but config.budget_usd is ` +
        `only $${budget.toFixed(2)}. Lower a node's sub_budget_usd or raise the workflow budget.`,
    );
  }
}

function validateRouters(nodes: SpecNode[], edges: SpecEdge[], errors: string[]): void {
  for (const n of nodes) {
    if (n.type !== "router") continue;
    const outs = edges.filter((e) => e.source === n.id);
    if (outs.length < 2) {
      errors.push(`Router node '${n.id}' needs ≥2 outgoing edges (found ${outs.length}); routers branch.`);
    }
    const noCond = outs.filter((e) => !e.condition).map((e) => e.target);
    if (noCond.length) {
      errors.push(
        `Router node '${n.id}' has outgoing edge(s) with no 'condition' label ` +
          `(to ${pylist(noCond)}). Each branch of a router needs a condition.`,
      );
    }
  }
}

function validateConnectivity(
  nodes: SpecNode[],
  goodEdges: GoodEdge[],
  ids: Set<string>,
  errors: string[],
): void {
  const starts = nodes.filter((n) => n.type === "start").map((n) => n.id);
  if (starts.length !== 1) return;
  const adj: Record<string, string[]> = {};
  for (const [s, t] of goodEdges) (adj[s] ??= []).push(t);
  const seen = new Set<string>();
  const stack = [starts[0]];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(adj[cur] ?? []));
  }
  const unreachable = [...ids].filter((x) => !seen.has(x)).sort();
  if (unreachable.length) {
    errors.push(
      `Node(s) not reachable from start: ${pylist(unreachable)}. ` +
        "Connect them with an edge or remove them.",
    );
  }
}

function detectCycles(goodEdges: GoodEdge[], notes: string[]): void {
  const adj: Record<string, string[]> = {};
  for (const [s, t] of goodEdges) (adj[s] ??= []).push(t);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color: Record<string, number> = {};
  const found: string[][] = [];

  const dfs = (u: string, path: string[]) => {
    color[u] = GRAY;
    path.push(u);
    for (const v of adj[u] ?? []) {
      if (color[v] === GRAY) found.push([...path.slice(path.indexOf(v)), v]);
      else if ((color[v] ?? WHITE) === WHITE) dfs(v, path);
    }
    path.pop();
    color[u] = BLACK;
  };

  for (const u of Object.keys(adj)) if ((color[u] ?? WHITE) === WHITE) dfs(u, []);

  const seen = new Set<string>();
  for (const cyc of found) {
    const key = [...cyc].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(
      `Cycle detected: ${cyc.join(" → ")}. Cycles are allowed — your budget and max_hops ` +
        "are the only things bounding this loop.",
    );
  }
}

// ---------- codegen (byte-identical to codegen.py) ----------
const PY_KEYWORDS = new Set(
  ("False None True and as assert async await break class continue def del elif else except " +
    "finally for from global if import in is lambda nonlocal not or pass raise return try while " +
    "with yield").split(" "),
);

function ident(raw: string, used: Set<string>): string {
  let s = raw.replace(/\W/g, "_");
  if (!s || /^[0-9]/.test(s)) s = "n_" + s;
  if (PY_KEYWORDS.has(s)) s += "_";
  const base = s;
  let i = 1;
  while (used.has(s)) {
    s = `${base}_${i}`;
    i++;
  }
  used.add(s);
  return s;
}

const money = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const intf = (v: number) => String(Math.trunc(v));
const fmtStr = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Approved node code (the function body) → 4-space-indented lines, or null to fall back to the
// TODO stub. MUST stay byte-identical to codegen.py:_code_body.
function codeBody(code: unknown): string[] | null {
  if (typeof code !== "string") return null;
  const trimmed = code.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  return trimmed.split("\n").map((l) => (l.trim() === "" ? "" : "    " + l));
}

export function generate(spec: GraphSpec): string {
  const config = spec.config ?? {};
  const nodes = spec.nodes ?? [];
  const edges = spec.edges ?? [];
  const startId = nodes.find((n) => n.type === "start")?.id ?? null;
  const endIds = new Set(nodes.filter((n) => n.type === "end").map((n) => n.id));

  const used = new Set<string>();
  const fnOf: Record<string, string> = {};
  for (const n of nodes) {
    if (["model", "tool", "router"].includes(n.type)) fnOf[n.id] = ident(n.id, used);
  }

  const lines: string[] = [
    "# Generated by Breakerbox Builder. Edit the node bodies marked TODO.",
    ...ceilingComment(costCeiling(spec)),
    "from langgraph.graph import END, START, StateGraph",
    "from langgraph.checkpoint.memory import MemorySaver",
    "",
    "from breakerbox import guard",
    "",
  ];

  for (const n of nodes) {
    const fn = fnOf[n.id];
    if (n.type === "model") {
      const mt = "max_tokens" in n ? n.max_tokens : "default";
      const sb = n.sub_budget_usd !== undefined ? `$${n.sub_budget_usd.toFixed(2)}` : "unset";
      const body = codeBody(n.code) ?? [
        "    # TODO: call your model here and update state",
        "    return state",
      ];
      lines.push(
        "",
        `def ${fn}(state):  # model: ${n.model} · max_tokens=${mt} · sub_budget=${sb}`,
        ...body,
        "",
      );
    } else if (n.type === "tool") {
      const sec = n.side_effect_class;
      // side_effect_class is the source of truth when set (read = safe); else the boolean.
      const se = (sec ? sec !== "read" : !!n.side_effecting) ? "True" : "False";
      let comment = `# tool: ${n.name} · side_effecting=${se}`;
      if (sec) comment += ` · class=${sec}`;
      const body = codeBody(n.code) ?? [
        `    # TODO: run the ${n.name} tool and update state`,
        "    return state",
      ];
      lines.push("", `def ${fn}(state):  ${comment}`, ...body, "");
    } else if (n.type === "router") {
      const labels = edges.filter((e) => e.source === n.id).map((e) => e.condition);
      const def = labels.length ? fmtStr(String(labels[0])) : '"pass"';
      const body = codeBody(n.code) ?? [
        "    # TODO: (optional) prep state before routing",
        "    return state",
      ];
      lines.push(
        "",
        `def ${fn}(state):  # router: ${n.condition || "route"}`,
        ...body,
        "",
        "",
        `def ${fn}_route(state):`,
        `    # TODO: return one of: ${labels.map(String).join(", ")}`,
        `    return ${def}`,
        "",
      );
    }
  }

  lines.push("", "builder = StateGraph(dict)");
  for (const n of nodes) if (fnOf[n.id]) lines.push(`builder.add_node("${n.id}", ${fnOf[n.id]})`);

  const routerIds = new Set(nodes.filter((n) => n.type === "router").map((n) => n.id));
  const dst = (t: string) => (endIds.has(t) ? "END" : `"${t}"`);

  for (const e of edges) {
    if (routerIds.has(e.source)) continue;
    const src = e.source === startId ? "START" : `"${e.source}"`;
    lines.push(`builder.add_edge(${src}, ${dst(e.target)})`);
  }
  for (const n of nodes.filter((n) => n.type === "router")) {
    const mapping = edges
      .filter((e) => e.source === n.id)
      .map((e) => `${fmtStr(String(e.condition))}: ${dst(e.target)}`)
      .join(", ");
    lines.push(`builder.add_conditional_edges("${n.id}", ${fnOf[n.id]}_route, {${mapping}})`);
  }

  const kw: string[] = [];
  if (config.budget_usd !== undefined) kw.push(`    budget_usd=${money(config.budget_usd)},`);
  if (config.max_hops !== undefined) kw.push(`    max_hops=${intf(config.max_hops)},`);
  if (config.ttl_seconds !== undefined) kw.push(`    ttl_seconds=${intf(config.ttl_seconds)},`);
  if (config.velocity_usd_per_min !== undefined) {
    kw.push(`    velocity_usd_per_min=${money(config.velocity_usd_per_min)},`);
  }
  if (config.on_trip !== undefined) kw.push(`    on_trip="${config.on_trip}",`);
  const sub = nodes.filter((n) => n.type === "model" && n.sub_budget_usd !== undefined);
  if (sub.length) {
    const items = sub.map((n) => `"${n.id}": ${money(n.sub_budget_usd as number)}`).join(", ");
    kw.push(`    sub_budgets={${items}},`);
  }

  // Destructive tools get a human-approval gate baked into the compiled graph: LangGraph pauses
  // before those nodes so a person must resume. Safety made static — visible in the code you own.
  const destructive = nodes
    .filter((n) => n.type === "tool" && n.side_effect_class === "destructive")
    .map((n) => n.id);
  const compileLine = destructive.length
    ? `    builder.compile(checkpointer=MemorySaver(), interrupt_before=[${destructive
        .map((i) => `"${i}"`)
        .join(", ")}]),`
    : "    builder.compile(checkpointer=MemorySaver()),";
  const approvalNote = destructive.length
    ? ["# Destructive tools pause for human approval before running (interrupt_before)."]
    : [];

  lines.push(
    "",
    ...approvalNote,
    "app = guard(",
    compileLine,
    ...kw,
    ")",
    "",
    'if __name__ == "__main__":',
    "    print(app.invoke({}))",
    "",
  );
  return lines.join("\n");
}

export const toJson = (spec: GraphSpec) => JSON.stringify(spec, null, 2);
export const fromJson = (text: string): GraphSpec => JSON.parse(text);

export const EXAMPLE_SPEC: GraphSpec = {
  version: "1",
  config: { budget_usd: 5.0, max_hops: 50, ttl_seconds: 600, velocity_usd_per_min: 2.0, on_trip: "pause" },
  nodes: [
    { id: "start", type: "start" },
    { id: "planner", type: "model", model: "openai/gpt-4o", max_tokens: 1024, sub_budget_usd: 2.0 },
    { id: "search", type: "tool", name: "web_search", side_effecting: false },
    { id: "writer", type: "model", model: "anthropic/claude-sonnet-4-6", max_tokens: 2048, sub_budget_usd: 1.5 },
    { id: "publish", type: "tool", name: "post_to_cms", side_effecting: true },
    { id: "router", type: "router", condition: "quality_check" },
    { id: "end", type: "end" },
  ],
  edges: [
    { source: "start", target: "planner" },
    { source: "planner", target: "search" },
    { source: "search", target: "writer" },
    { source: "writer", target: "router" },
    { source: "router", target: "publish", condition: "pass" },
    { source: "router", target: "planner", condition: "retry" },
    { source: "publish", target: "end" },
  ],
};
