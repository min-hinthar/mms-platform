import { describe, expect, it } from "vitest";
import type { CartItem } from "@mms/db";
import { matchOwnLines } from "./own-lines";

/**
 * Lifecycle audit (edit-notes 0, HIGH) — the /menu quick-stepper owns ONLY the lines the server's
 * merge key would merge a plain "+" into (`insertOrIncLine`): this dish, no modifiers, no NOTE, the
 * default fulfillment, a draft, not comped, the viewer's own seat.
 *
 * The note term is the allergy rule: with it missing, a diner's "No peanuts — allergy" line and a
 * plain unit read as one count ("Mohinga, quantity 2"), and "−" picked the first line at qty 1 — the
 * NOTED one — and deleted it.
 */
const ME = "seat-me";
const line = (over: Partial<CartItem>): CartItem => ({
  id: "l",
  menuItemId: "mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  bySeat: ME,
  lineState: "draft",
  fulfillment: "dinein",
  notes: null,
  ...over,
});

describe("matchOwnLines — the stepper's lines mirror the server's merge key", () => {
  it("a NOTED line is never the stepper's — the allergy line cannot be counted or trimmed from /menu", () => {
    // MUTATION (lcb/own-lines/noted-line-counted): drop the notes term — the noted line is counted
    // with the plain one, and "−" deletes the allergy note's line; red.
    const noted = line({ id: "noted", notes: "No peanuts — allergy" });
    const plain = line({ id: "plain", notes: null });
    expect(matchOwnLines([noted, plain], "mohinga", "dinein", ME).map((l) => l.id)).toEqual([
      "plain",
    ]);
    // An empty note is no note (the server normalizes it away at insert).
    expect(matchOwnLines([line({ id: "e", notes: "" })], "mohinga", "dinein", ME)).toHaveLength(1);
  });

  it("keeps every other merge-key term: dish, modifiers, fulfillment, draft, comp, seat", () => {
    const own = line({ id: "own" });
    const others = [
      line({ id: "dish", menuItemId: "tea-leaf" }),
      line({ id: "mods", modifiers: ["Extra egg"] }),
      line({ id: "togo", fulfillment: "togo" }),
      line({ id: "sent", lineState: "fired" }),
      line({ id: "comp", comped: true }),
      line({ id: "peer", bySeat: "seat-ana" }),
      line({ id: "staff", bySeat: undefined }),
    ];
    expect(matchOwnLines([own, ...others], "mohinga", "dinein", ME).map((l) => l.id)).toEqual([
      "own",
    ]);
  });

  it("an unknown seat owns nothing (a staff line's bySeat is undefined too)", () => {
    expect(matchOwnLines([line({ bySeat: undefined })], "mohinga", "dinein", undefined)).toEqual(
      [],
    );
  });
});
