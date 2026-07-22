import { createContext } from "react";

// node id -> validation issue (for the red ring + tooltip on the canvas)
export const NodeIssues = createContext<Record<string, string>>({});
