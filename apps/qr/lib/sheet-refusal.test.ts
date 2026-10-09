import { describe, expect, it } from "vitest";
import { nextRefusal } from "./sheet-refusal";

/**
 * PD4 — the Name sheet's refusal. Each MUTATION is a row in scripts/verify-slice.mjs
 * (`sheet-refusal/…`), induced and watched go red.
 */
describe("nextRefusal — every refusal arrives as a new node", () => {
  it("an IDENTICAL sentence twice still gets a new key (the live region re-announces it)", () => {
    // MUTATION: a constant key → the second identical refusal changes no DOM and is never heard; red.
    const a = nextRefusal(null, "Hang on — this basket’s being checked out.");
    const b = nextRefusal(a, "Hang on — this basket’s being checked out.");
    expect(b.text).toBe(a.text);
    expect(b.key).not.toBe(a.key);
  });

  it("keeps the Burmese half", () => {
    // MUTATION: drop `my` → the sheet says the English half only; red.
    expect(nextRefusal(null, "Saved — we’ll check it when you’re back online.", "မြန်မာ").my).toBe(
      "မြန်မာ",
    );
    expect(nextRefusal(null, "Couldn’t add that.").my).toBeNull();
  });
});
