import { createContext } from "react";
import type { NodeForecast } from "@/lib/forecast";

// node id -> validation issue (for the red ring + tooltip on the canvas)
export const NodeIssues = createContext<Record<string, string>>({});

// node id -> cost forecast (for the on-canvas cost badge)
export const NodeForecasts = createContext<Record<string, NodeForecast>>({});
