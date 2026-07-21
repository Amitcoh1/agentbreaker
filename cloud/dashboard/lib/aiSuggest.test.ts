import { describe, expect, it } from "vitest";
import { providerNote, stripCodeFences } from "./aiSuggest";

describe("aiSuggest helpers", () => {
  it("strips ```python fences and trims", () => {
    expect(stripCodeFences("```python\nreturn state\n```")).toBe("return state");
    expect(stripCodeFences("```\nx = 1\n```")).toBe("x = 1");
    expect(stripCodeFences("no fences here")).toBe("no fences here");
  });

  it("warns about OpenAI browser CORS only without a base URL", () => {
    expect(providerNote("openai")).toMatch(/CORS/);
    expect(providerNote("openai", "https://my-proxy.example")).toBeNull();
    expect(providerNote("anthropic")).toBeNull();
  });
});
