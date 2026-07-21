import type { SpecNode } from "./graphspec";

// Bring-your-own-key AI code suggestions. The provider API key lives ONLY in this browser
// (localStorage) and is sent ONLY to the provider's own endpoint (or a base URL you supply) —
// never to a Breakerbox server. There is no Breakerbox endpoint in this path at all. The result
// is a code *snippet* to copy into the Python you already own; it is never stored in the spec.
export type Provider = "anthropic" | "openai";
export type AiSettings = { provider: Provider; model: string; apiKey: string; baseUrl?: string };

const KEY = "ab_ai_settings";
const DEFAULTS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
};

export function loadAiSettings(): AiSettings {
  if (typeof window !== "undefined") {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AiSettings>;
      if (s.provider) return { provider: s.provider, model: s.model || DEFAULTS[s.provider], apiKey: s.apiKey ?? "", baseUrl: s.baseUrl };
    } catch {
      /* fall through to default */
    }
  }
  return { provider: "anthropic", model: DEFAULTS.anthropic, apiKey: "" };
}

export function saveAiSettings(s: AiSettings) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(s));
}

// OpenAI blocks browser CORS, so a direct call from the page fails unless you point base URL at
// your own CORS-enabled proxy. Anthropic supports direct browser calls (opt-in header). Surfaced
// in the UI so the one honest limitation isn't a silent failure.
export function providerNote(p: Provider, baseUrl?: string): string | null {
  if (p === "openai" && !baseUrl)
    return "OpenAI blocks direct browser calls (CORS). Set a base URL pointing at your own CORS-enabled proxy, or use Anthropic.";
  return null;
}

export function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:python|py)?\s*\n([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function prompt(node: SpecNode, description: string): string {
  const what =
    node.type === "model"
      ? `a model step (model: ${node.model || "unspecified"})`
      : node.type === "tool"
        ? `a tool step (tool name: ${node.name || node.id})`
        : `a ${node.type} step`;
  return [
    `You are writing the Python body of one node in a LangGraph workflow guarded by the`,
    `\`agentbreaker\` library. This node is ${what}, named \`${node.id}\`.`,
    description ? `The step should: ${description}` : `Infer a sensible behavior from the node's name and type.`,
    ``,
    `Return ONLY the body of \`def ${node.id}(state: dict) -> dict:\` — no function signature,`,
    `no markdown fences, no prose. Read inputs from \`state\`, do the work, and return the`,
    `updated \`state\`. Keep it plain, readable, and self-contained. Do not read environment`,
    `variables for keys inline; assume the caller configured the client.`,
  ].join("\n");
}

export async function suggestCode(
  settings: AiSettings,
  node: SpecNode,
  description: string,
): Promise<string> {
  const body = prompt(node, description);
  if (settings.provider === "anthropic") {
    const res = await fetch((settings.baseUrl || "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: body }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return stripCodeFences(data?.content?.[0]?.text ?? "");
  }
  // OpenAI-compatible (requires a CORS-enabled base URL in the browser)
  const res = await fetch((settings.baseUrl || "https://api.openai.com/v1") + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: body }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return stripCodeFences(data?.choices?.[0]?.message?.content ?? "");
}
