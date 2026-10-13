import { describe, expect, it } from "vitest";
import { paidRoundCapNote, paidRoundKitchen, type PaidKitchenRow } from "./paid-round";
import { STAFF } from "./i18n/staff";
import { fill } from "./i18n/fill";
import { KDS_UNDO_MS } from "./kds-undo";

/** The lifecycle audit — a paid round's food still in the kitchen, as the table page names it. */
const NOW = "2026-10-13T19:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const MIN = 60_000;
const row = (over: Partial<PaidKitchenRow>): PaidKitchenRow => ({
  id: "l",
  name: "Mohinga",
  qty: 1,
  state: "fired",
  fire_at: at(-2 * MIN),
  bumped_at: null,
  fulfillment: "dinein",
  notes: null,
  modifiers: [],
  ...over,
});

describe("paidRoundKitchen", () => {
  it("draws each dish still sent or cooking, with its stage — a bump inside the undo still cooks", () => {
    const out = paidRoundKitchen(
      [
        row({ id: "a" }),
        row({ id: "b", state: "in_progress" }),
        row({ id: "c", state: "served", bumped_at: at(-(KDS_UNDO_MS - 1)) }),
      ],
      NOW,
    );
    expect(out.map((l) => [l.id, l.stage])).toEqual([
      ["a", "sent"],
      ["b", "cooking"],
      ["c", "cooking"],
    ]);
  });

  it("a served dish is drawn while the card still calls it ready, then it is history", () => {
    // lck/paid-round/served-forever — every dish the table ever ate, re-listed under the record.
    const out = paidRoundKitchen(
      [
        row({ id: "just", state: "served", bumped_at: at(-MIN) }),
        row({ id: "long", state: "served", bumped_at: at(-6 * MIN) }),
      ],
      NOW,
      5 * MIN,
    );
    expect(out.map((l) => [l.id, l.stage])).toEqual([["just", "served"]]);
  });

  it("a voided or grocery line is off the track; a to-go dish says so", () => {
    const out = paidRoundKitchen(
      [
        row({ id: "v", state: "voided" }),
        row({ id: "g", fulfillment: "grocery" }),
        row({ id: "t", fulfillment: "togo", notes: "no chilli", modifiers: ["Large"] }),
      ],
      NOW,
    );
    expect(out).toEqual([
      {
        id: "t",
        name: "Mohinga",
        qty: 1,
        stage: "sent",
        notes: "no chilli",
        modifiers: ["Large"],
        togo: true,
      },
    ]);
  });
});

describe("paidRoundCapNote — under a cap, only a number that is TRUE (#360 blind pass, CRITICAL 2)", () => {
  const say = (n: ReturnType<typeof paidRoundCapNote>) =>
    n === null ? null : fill(STAFF[n.key].en, n.vars ?? {}, "en");

  it("the dish read hit its cap: the count is the dishes DRAWN, never the read's cap", () => {
    // Most of a long night's capped read is dishes served long ago, which the group does not draw:
    // "Showing the latest 100 dishes" over two of them was a made-up count.
    // lck/paid-round/cap-note-counts-the-cap — red.
    expect(say(paidRoundCapNote(2, true, false))).toBe(
      "Showing the latest 2 dishes — older ones aren’t listed here.",
    );
    expect(say(paidRoundCapNote(1, true, false))).toBe(
      "Showing the latest 1 dish — older ones aren’t listed here.",
    );
    // both caps: the dish sentence already says older ones are not here
    expect(say(paidRoundCapNote(2, true, true))).toBe(
      "Showing the latest 2 dishes — older ones aren’t listed here.",
    );
  });

  it("only the ROUNDS were capped: older rounds are not listed — with no number", () => {
    // lck/paid-round/rounds-cap-unsaid — red.
    expect(say(paidRoundCapNote(1, false, true))).toBe("Older rounds aren’t listed here.");
  });

  it("no cap, no note", () => {
    expect(paidRoundCapNote(3, false, false)).toBeNull();
  });
});
