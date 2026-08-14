import { describe, expect, it } from "vitest";
import { initialStage } from "./checkout-stage";

/**
 * W12 — the two-moment landing rule, pinned:
 *   drafts → Order (still building a round); fired-only → Bill (came back to pay);
 *   empty → Order (the empty state renders first anyway — never a $0 bill).
 */
const line = (lineState: "draft" | "fired" | "in_progress" | "served" | "voided") => ({
  lineState,
});

describe("initialStage — where the dine-in cart lands", () => {
  it("any draft line lands on the Order moment (a round is still being built)", () => {
    expect(initialStage([line("fired"), line("served"), line("draft")])).toBe("order");
  });
  it("everything with the kitchen lands on the Bill moment (the settle-nudge journey)", () => {
    expect(initialStage([line("fired"), line("in_progress"), line("served")])).toBe("bill");
  });
  it("an empty cart answers Order — the bill of nothing is never the landing", () => {
    expect(initialStage([])).toBe("order");
  });
  it("voided-only still answers Bill — the record of the table, not a fresh round", () => {
    expect(initialStage([line("voided")])).toBe("bill");
  });
});
