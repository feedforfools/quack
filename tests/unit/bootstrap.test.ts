import { describe, expect, it } from "vitest";

/**
 * Trivial sanity test confirming the Vitest + jsdom environment is wired up.
 * A real feature test would import a component or hook; this lives here as
 * the E0-T5 baseline. Feature tests land alongside their feature (E1+).
 */
describe("vitest bootstrap", () => {
  it("evaluates truthy assertions", () => {
    expect(true).toBe(true);
  });

  it("can access the DOM via jsdom", () => {
    const el = document.createElement("div");
    el.textContent = "quack";
    expect(el.textContent).toBe("quack");
  });
});
