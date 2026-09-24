import { describe, expect, it } from "vitest";
import { createRevertCue, pillAddClaim, sheetAddClaim, stepClaim } from "./add-feedback";
import { freshnessDurationMs } from "./catalog-freshness";

/**
 * Phase 1c — the add moment's words, and the one verdict that draws a reversal.
 *
 * The claims are pinned as VALUES here (and only here): every component suite derives its
 * expectation by calling these functions, so a copy change is one edit in one place and cannot pass
 * one surface while failing another.
 */

describe("pillAddClaim — the pill's tap names the dish, quietly", () => {
  it("is the named claim, the trusted Burmese half, quiet, for 2s", () => {
    expect(pillAddClaim("Mohinga")).toEqual({
      text: "Mohinga added",
      my: "ထည့်ပြီးပါပြီ",
      quiet: true,
      ms: 2000,
    });
  });
});

describe("stepClaim — a stepper step, spoken at the tap", () => {
  it("names the dish and the quantity the diner is looking at", () => {
    expect(stepClaim("Mohinga", 3)).toEqual({
      text: "Mohinga, quantity 3",
      quiet: true,
      ms: 2000,
    });
  });

  it("an emptying step says the dish left, not 'quantity 0'", () => {
    expect(stepClaim("Mohinga", 0)).toEqual({ text: "Removed Mohinga", quiet: true, ms: 2000 });
  });
});

describe("sheetAddClaim — a configured dish is named VISIBLY, because its origin has closed", () => {
  it("qty 1: the dish, the trusted Burmese half, visible, held for its reading time", () => {
    const claim = sheetAddClaim("Mohinga", 1);
    expect(claim.text).toBe("Mohinga added");
    expect(claim.my).toBe("ထည့်ပြီးပါပြီ");
    expect(claim.quiet).not.toBe(true);
    expect(claim.ms).toBe(freshnessDurationMs("Mohinga added"));
  });

  it("qty > 1 leads with the count as a WORD position, never '2 ×' (read aloud as 'times')", () => {
    expect(sheetAddClaim("Mohinga", 2).text).toBe("2 Mohinga added");
  });

  it("a long dish name is held longer — the duration is derived, never a constant", () => {
    const long = "Shan-style rice noodles with pickled mustard greens and garlic oil";
    expect(long.length).toBeGreaterThanOrEqual(60);
    const claim = sheetAddClaim(long, 1);
    expect(claim.ms).toBe(freshnessDurationMs(`${long} added`));
    expect(claim.ms).toBeGreaterThan(freshnessDurationMs("Mohinga added"));
  });
});

describe("createRevertCue — only a DEFINITE non-landing is drawn as one", () => {
  it("cues a refusal, whatever the line looks like", () => {
    expect(createRevertCue({ state: "refused", lineVisible: null })).toBe(true);
    expect(createRevertCue({ state: "refused", lineVisible: false })).toBe(true);
  });

  it("cues an applied write whose current view shows no own line (the T25 no-op)", () => {
    expect(createRevertCue({ state: "applied", lineVisible: false })).toBe(true);
  });

  it("never cues a landing, nor an applied write whose line cannot be read", () => {
    expect(createRevertCue({ state: "applied", lineVisible: true })).toBe(false);
    // Seat unknown or view overtaken: nothing to read the line off, so a success is never drawn
    // as a failure.
    expect(createRevertCue({ state: "applied", lineVisible: null })).toBe(false);
  });

  it("never cues an UNCONFIRMED write — it may be on the bill", () => {
    expect(createRevertCue({ state: "unconfirmed", lineVisible: false })).toBe(false);
    expect(createRevertCue({ state: "unconfirmed", lineVisible: null })).toBe(false);
  });
});
