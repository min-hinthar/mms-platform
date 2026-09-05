import { describe, expect, it } from "vitest";
import { PILOT_PROMO_CODE, isPilotCode, promoTag } from "./pilot-tag";

/**
 * P5 — the reporting tag. Every case here is a shape `qr_carts.promo_code` can actually hold: a
 * `text` column with no NOT NULL and no CHECK, written today by one uppercasing writer and, per
 * OPEN-ITEMS P2e, about to gain a second.
 */
describe("promoTag — the one normalizer behind every reported promo code", () => {
  it("passes an already-canonical code through unchanged", () => {
    expect(promoTag("PILOT15")).toBe("PILOT15");
  });

  it("upper-cases, so one campaign is one value in a filter", () => {
    // The failure this prevents is not a crash: it is `PILOT15` and `pilot15` reading as two
    // campaigns, one of which under-counts the pilot by however many orders took the other spelling.
    expect(promoTag("pilot15")).toBe("PILOT15");
    expect(promoTag("Pilot15")).toBe("PILOT15");
  });

  it("trims, because a stray space is a different filter value and nothing else", () => {
    expect(promoTag("  pilot15  ")).toBe("PILOT15");
  });

  it("reports NO CODE for every not-a-code shape the column can hold", () => {
    // The empty string is the one that bites: a writer that clears a code by writing `""` rather
    // than NULL would otherwise put a nameless "campaign" on the money path's events.
    expect(promoTag("")).toBeNull();
    expect(promoTag("   ")).toBeNull();
    expect(promoTag(null)).toBeNull();
    expect(promoTag(undefined)).toBeNull();
  });

  it("never invents a code from a non-string", () => {
    expect(promoTag(42 as unknown as string)).toBeNull();
  });

  it("isPilotCode answers on the normalized value, not the raw one", () => {
    expect(isPilotCode(" pilot15 ")).toBe(true);
    expect(isPilotCode("WELCOME10")).toBe(false);
    expect(isPilotCode(null)).toBe(false);
    // The constant and the predicate must agree — a rename that touched only one would pass every
    // other assertion in this file.
    expect(isPilotCode(PILOT_PROMO_CODE)).toBe(true);
  });
});
