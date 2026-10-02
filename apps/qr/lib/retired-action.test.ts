import { describe, expect, it } from "vitest";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { isRetiredActionError } from "./retired-action";

/**
 * Phase 2i (P2bi) — the retired-action classifier. The REAL class is imported (not a look-alike),
 * so a Next upgrade that breaks either the predicate or the class's `name` reddens here.
 */
describe("isRetiredActionError", () => {
  it("Next's own UnrecognizedActionError is a retired action", () => {
    expect(isRetiredActionError(new UnrecognizedActionError("Server Action not found"))).toBe(true);
  });

  it("any other failure is not — a network error never retires the tab", () => {
    // MUTATION (p2i-retired/any-error): every rejection reads as retired — one dropped connection
    // relaxes the reload verdict and shortens every window; red.
    expect(isRetiredActionError(new Error("x"))).toBe(false);
    expect(isRetiredActionError(new TypeError("fetch failed"))).toBe(false);
    expect(isRetiredActionError({ name: "UnrecognizedActionError" })).toBe(false);
    expect(isRetiredActionError(null)).toBe(false);
    expect(isRetiredActionError("UnrecognizedActionError")).toBe(false);
  });

  it("an Error NAMED UnrecognizedActionError counts (the belt for a moved export)", () => {
    // MUTATION (p2i-retired/name-fallback-dropped): only the `unstable_` instanceof is read — a Next
    // upgrade that ships a second copy of the class leaves every retired id unnoticed; red.
    const e = new Error("Server Action not found");
    e.name = "UnrecognizedActionError";
    expect(isRetiredActionError(e)).toBe(true);
  });
});
