import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import dashboard from "./prices.json";

// The dashboard price table is a copy of the Python one; lock them so they can't drift.
// `agentbreaker update-prices` refreshes both; this test fails if only one was updated.
describe("dashboard price table matches the Python source", () => {
  it("is byte-for-byte the same table", () => {
    const py = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../src/agentbreaker/prices.json", import.meta.url)), "utf8"),
    );
    expect(dashboard).toEqual(py);
  });
});
