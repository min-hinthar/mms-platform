import { describe, expect, it } from "vitest";
import { landedSoldOut } from "./sold-out-landing";
import type { SoldOutErrCode } from "./menu-availability";

/**
 * P2au — "did the dish change" is not `ok`. The ledger-insert failure lands the flag and answers
 * `ok: false` (code `unlogged`) so its sentence is never swallowed; every caller that records or
 * undoes the flip asks THIS instead.
 */
describe("landedSoldOut — what our write made the dish, apart from whether it was logged", () => {
  it("a clean success landed its flag, in either direction", () => {
    expect(landedSoldOut({ ok: true, soldOut: true })).toBe(true);
    expect(landedSoldOut({ ok: true, soldOut: false })).toBe(false);
  });

  it("an UNLOGGED answer landed its flag too — in either direction", () => {
    const error = "Mohinga is sold out, but the change wasn’t logged — tell the owner it was you.";
    expect(landedSoldOut({ ok: false, error, code: "unlogged", soldOut: true })).toBe(true);
    expect(landedSoldOut({ ok: false, error, code: "unlogged", soldOut: false })).toBe(false);
  });

  it("every other refusal changed nothing", () => {
    // The codes that write nothing, listed so a NEW code has to be placed on one side or the other.
    const unwritten: readonly Exclude<SoldOutErrCode, "unlogged">[] = [
      "sentence",
      "invalid",
      "gone",
      "stale",
    ];
    for (const code of unwritten) expect(landedSoldOut({ ok: false, error: "x", code })).toBeNull();
  });
});
