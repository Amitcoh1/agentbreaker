import { EXAMPLE_SPEC, type GraphSpec } from "./graphspec";

// Prewired starting points — budgets, max_tokens, and side-effect tags already set.
export const TEMPLATES: { name: string; spec: GraphSpec }[] = [
  { name: "Research → write (router loop)", spec: EXAMPLE_SPEC },
  {
    name: "Tool loop with quality gate",
    spec: {
      version: "1",
      config: { budget_usd: 2.0, max_hops: 40, on_trip: "kill" },
      nodes: [
        { id: "start", type: "start" },
        { id: "agent", type: "model", model: "openai/gpt-4o-mini", max_tokens: 512, sub_budget_usd: 1.0 },
        { id: "search", type: "tool", name: "web_search", side_effecting: false },
        { id: "gate", type: "router", condition: "good_enough" },
        { id: "end", type: "end" },
      ],
      edges: [
        { source: "start", target: "agent" },
        { source: "agent", target: "search" },
        { source: "search", target: "gate" },
        { source: "gate", target: "agent", condition: "retry" },
        { source: "gate", target: "end", condition: "done" },
      ],
    },
  },
  {
    name: "RAG writer",
    spec: {
      version: "1",
      config: { budget_usd: 1.0, max_hops: 10, on_trip: "pause" },
      nodes: [
        { id: "start", type: "start" },
        { id: "retrieve", type: "tool", name: "vector_search", side_effecting: false },
        { id: "writer", type: "model", model: "anthropic/claude-sonnet-4-6", max_tokens: 2048, sub_budget_usd: 0.8 },
        { id: "end", type: "end" },
      ],
      edges: [
        { source: "start", target: "retrieve" },
        { source: "retrieve", target: "writer" },
        { source: "writer", target: "end" },
      ],
    },
  },
  {
    name: "Blank",
    spec: {
      version: "1",
      config: { budget_usd: 5.0, max_hops: 50, on_trip: "pause" },
      nodes: [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      edges: [{ source: "start", target: "end" }],
    },
  },
];
