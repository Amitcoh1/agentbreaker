import { describe, expect, it } from "vitest";
import { EXAMPLE_SPEC } from "./graphspec";
import { remove, rename, upsert, type UserTemplate } from "./userTemplates";

const base: UserTemplate[] = [];

describe("user template pure core", () => {
  it("upsert adds, then replaces a same-named template (no duplicates)", () => {
    const one = upsert(base, "  My flow ", EXAMPLE_SPEC);
    expect(one.map((t) => t.name)).toEqual(["My flow"]); // trimmed
    const two = upsert(one, "My flow", { ...EXAMPLE_SPEC, config: { ...EXAMPLE_SPEC.config, budget_usd: 9 } });
    expect(two).toHaveLength(1);
    expect(two[0].spec.config?.budget_usd).toBe(9);
  });

  it("remove deletes by name", () => {
    const list = upsert(upsert(base, "a", EXAMPLE_SPEC), "b", EXAMPLE_SPEC);
    expect(remove(list, "a").map((t) => t.name)).toEqual(["b"]);
  });

  it("rename moves a template but is a no-op on collision", () => {
    const list = upsert(upsert(base, "a", EXAMPLE_SPEC), "b", EXAMPLE_SPEC);
    expect(rename(list, "a", "c").map((t) => t.name)).toEqual(["b", "c"]);
    expect(rename(list, "a", "b")).toBe(list); // collision -> unchanged reference
  });
});
