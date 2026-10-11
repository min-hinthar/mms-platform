import { describe, expect, it } from "vitest";
import { chipAction, chipDrawn, chipFactsFor, repeatSentence, type ChipFacts } from "./scan-chip";

/**
 * PD4 (blind pass 2 on #329) — the chip's action slot and the repeat toast read ONE predicate. Each
 * MUTATION is a row in scripts/verify-slice.mjs (`scan-chip/…`), induced and watched go red.
 */

const line: ChipFacts = {
  undo: false,
  inBasket: true,
  queued: false,
  cached: false,
  viaPairing: false,
};

describe("chipAction — the slot holds at most one control", () => {
  it("a line with no Undo open → Add another", () => {
    expect(chipAction(line)).toBe("add-another");
  });

  it("the Undo's window is open → the Undo, never Add another beside or instead of it", () => {
    // MUTATION: Add another ahead of the Undo → the toast promises a control the slot hands to the
    // Undo (or the Undo a shopper just needed is gone); red.
    expect(chipAction({ ...line, undo: true })).toBe("undo");
  });

  it("REACHED THROUGH A PAIRING → no Add another: one tap would charge an item the camera never sighted", () => {
    // MUTATION: ignore `viaPairing` → a re-read of a missed jar offers a one-tap charge of whatever
    // the shopper added from that miss's sheet; red.
    expect(chipAction({ ...line, viaPairing: true })).toBe("none");
    // ...while the shopper's own Undo of that sheet add still holds its slot.
    expect(chipAction({ ...line, viaPairing: true, undo: true })).toBe("undo");
  });

  it("a queued code: Add another only when the cache can name it", () => {
    const queued = { ...line, inBasket: false, queued: true };
    expect(chipAction({ ...queued, cached: true })).toBe("add-another");
    // MUTATION: offer it for an unknown saved scan → a second copy of a code nothing can name; red.
    expect(chipAction({ ...queued, cached: false })).toBe("none");
  });

  it("no line and nothing queued → no chip, so no control (the 'list out of date' repeat)", () => {
    // MUTATION: drop the drawn check → a cached code with no line and no queue "offers" a control
    // no chip is there to draw; red.
    const gone = { ...line, inBasket: false, cached: true };
    expect(chipDrawn(gone)).toBe(false);
    expect(chipAction(gone)).toBe("none");
  });
});

describe("chipFactsFor — ONE derivation for the chip (state) and the toast (its ref mirrors)", () => {
  const view = {
    lines: [{ barcode: "A" }],
    queued: ["Q"],
    undoBarcode: "B" as string | null,
    cached: (code: string) => code === "Q" || code === "A",
  };

  it("an Undo for ANOTHER code does not hold this chip's slot", () => {
    // MUTATION: any open Undo counts → a re-read of jar A while B's Undo runs says no "Add another"
    // and the chip draws none, though nothing occupies A's slot; red.
    expect(chipFactsFor("A", false, view).undo).toBe(false);
    expect(chipFactsFor("B", false, { ...view, lines: [{ barcode: "B" }] }).undo).toBe(true);
  });

  it("reads the line, the queue and the cache for THIS code; a line is never 'cached'", () => {
    expect(chipFactsFor("A", true, view)).toEqual({
      undo: false,
      inBasket: true,
      queued: false,
      cached: false,
      viaPairing: true,
    });
    expect(chipFactsFor("Q", false, view)).toEqual({
      undo: false,
      inBasket: false,
      queued: true,
      cached: true,
      viaPairing: false,
    });
  });
});

describe("repeatSentence — the 'Add another' clause only when that control is drawn", () => {
  const basket = {
    kind: "repeat",
    where: "basket",
    lineId: "l1",
    name: "Tea Leaves -400g",
    qty: 1,
  } as const;

  it("basket, Add another drawn → the clause", () => {
    expect(repeatSentence(basket, "add-another", false)).toBe(
      "Tea Leaves -400g is already in your basket (×1) — tap “Add another” for a second.",
    );
  });

  it("basket, the Undo holds the slot → no clause (blind pass 2 on #329, critical 3)", () => {
    // MUTATION: the clause on any basket repeat → "tap “Add another”" while the slot shows Undo; red.
    expect(repeatSentence(basket, "undo", false)).toBe(
      "Tea Leaves -400g is already in your basket (×1).",
    );
  });

  it("through a pairing → the shopper's own act, never 'this is that item', and no clause", () => {
    // MUTATION: the generic sentence → the jar is announced AS the item the shopper added by name; red.
    expect(repeatSentence(basket, "none", true)).toBe(
      "You added Tea Leaves -400g for this code — it’s in your basket (×1).",
    );
  });

  it("queued and out-of-date read the same predicate", () => {
    expect(repeatSentence({ kind: "repeat", where: "queued" }, "add-another", false)).toBe(
      "Already saved — we’ll check it when you’re back online. Tap “Add another” for a second.",
    );
    expect(repeatSentence({ kind: "repeat", where: "queued" }, "none", false)).toBe(
      "Already saved — we’ll check it when you’re back online.",
    );
    // No chip is drawn for a code the view does not show: the clause it used to carry was a lie.
    expect(repeatSentence({ kind: "repeat", where: "unconfirmed" }, "none", false)).toBe(
      "Already added — your list is out of date.",
    );
  });
});
