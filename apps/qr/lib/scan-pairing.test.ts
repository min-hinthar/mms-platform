import { describe, expect, it } from "vitest";
import { classifyScan, type ScanBasket } from "./scan-gate";
import {
  judgedBarcode,
  pairMiss,
  pairingAfterRemoval,
  pairingAfterUndo,
  pairingAfterVerdict,
  pairingWithout,
} from "./scan-pairing";

/**
 * PD4 — the miss→item pairing may only ever REPEAT, never charge. Each MUTATION below is a row in
 * scripts/verify-slice.mjs (`scan-pairing/…`), induced and watched go red.
 */

const SHELF = "0123456789012"; // the jar's real code — not in the catalog
const TEA = "2990000000017"; // the item the shopper added by name
const OTHER = "2990000000024";

const basket = (over: Partial<ScanBasket> = {}): ScanBasket => ({
  lines: [],
  queued: [],
  billed: [],
  ...over,
});

describe("judgedBarcode — what the basket is ASKED about", () => {
  it("the missed code is judged as the item it was paired to", () => {
    // MUTATION: judge the sighted code always → the re-read jar is a second miss; red.
    expect(judgedBarcode(pairMiss(SHELF, TEA), SHELF)).toBe(TEA);
  });

  it("any other code is judged as itself", () => {
    expect(judgedBarcode(pairMiss(SHELF, TEA), OTHER)).toBe(OTHER);
    expect(judgedBarcode(pairMiss(SHELF, TEA), TEA)).toBe(TEA);
    expect(judgedBarcode(null, SHELF)).toBe(SHELF);
  });
});

describe("pairingAfterVerdict — a pairing may only ever produce a REPEAT", () => {
  const pairing = pairMiss(SHELF, TEA);

  it("the paired item still in the basket → the pairing holds (the next re-read repeats too)", () => {
    const v = classifyScan(
      basket({ lines: [{ lineId: "l1", barcode: TEA, name: "Tea Leaves -400g", qty: 1 }] }),
      TEA,
    );
    expect(v.kind).toBe("repeat");
    // MUTATION: drop the pairing on every verdict → the second re-read is a miss again; red.
    expect(pairingAfterVerdict(pairing, TEA, v)).toBe(pairing);
  });

  it("the paired item gone from the basket (any path) → the pairing is SPENT, never a charge of the guess", () => {
    const v = classifyScan(basket(), TEA);
    expect(v.kind).toBe("add");
    // MUTATION: keep the pairing on `add` → the page keeps judging the jar as TEA, and the only
    // thing stopping a charge of TEA is page wiring; red.
    expect(pairingAfterVerdict(pairing, TEA, v)).toBeNull();
  });

  it("a verdict about a different barcode never touches the pairing", () => {
    expect(pairingAfterVerdict(pairing, OTHER, classifyScan(basket(), OTHER))).toBe(pairing);
    expect(pairingAfterVerdict(null, TEA, classifyScan(basket(), TEA))).toBeNull();
  });
});

describe("pairingWithout — the Undo (or a stepper to 0) forgets the pairing", () => {
  it("removing the paired item drops it", () => {
    expect(pairingWithout(pairMiss(SHELF, TEA), TEA)).toBeNull();
  });

  it("removing another item keeps it", () => {
    // MUTATION: drop on any removal → an unrelated remove un-pairs the rescued jar; red.
    const pairing = pairMiss(SHELF, TEA);
    expect(pairingWithout(pairing, OTHER)).toBe(pairing);
    expect(pairingWithout(null, TEA)).toBeNull();
  });
});

describe("pairingAfterRemoval — a removal spends the pairing only when its write LANDED", () => {
  it("a landed removal of the paired item drops it", () => {
    const pairing = pairMiss(SHELF, TEA);
    expect(pairingAfterRemoval(pairing, TEA, true, pairing)).toBeNull();
  });

  it("a REFUSED removal keeps it — the line rolled back, so the rescued jar still repeats", () => {
    // Codex r2 on #329 (4226434713). MUTATION: spend the pairing whatever the write did → the jar
    // re-reads as unknown while its item is still in the basket; red.
    const pairing = pairMiss(SHELF, TEA);
    expect(pairingAfterRemoval(pairing, TEA, false, pairing)).toBe(pairing);
  });

  it("a landed removal of ANOTHER item keeps it", () => {
    const pairing = pairMiss(SHELF, TEA);
    expect(pairingAfterRemoval(pairing, OTHER, true, pairing)).toBe(pairing);
  });

  it("CODEX R4 (4240341727) — a re-read while the removal was out SPENT it; the refused write restores it with the line", () => {
    // The order: the stepper removes TEA (the view drops the line at once) → the shopper re-reads
    // the rescued jar → `classifyScan` judges TEA against that optimistic view → `add` →
    // `pairingAfterVerdict` spends the pairing → the write is refused and the line rolls back. The
    // jar must repeat again. MUTATION: keep only what is left now → null, the jar and its line are
    // disconnected; red.
    const atStart = pairMiss(SHELF, TEA);
    const spent = pairingAfterVerdict(atStart, TEA, classifyScan(basket(), TEA));
    expect(spent).toBeNull();
    expect(pairingAfterRemoval(spent, TEA, false, atStart)).toBe(atStart);
  });

  it("a refused removal never resurrects a pairing to ANOTHER item, nor overwrites a newer one", () => {
    // The re-read spent a pairing to OTHER: OTHER really is gone, and the TEA removal's rollback
    // says nothing about it. MUTATION: restore whatever stood at the start → OTHER's spent pairing
    // comes back; red.
    const toOther = pairMiss(SHELF, OTHER);
    expect(pairingAfterRemoval(null, TEA, false, toOther)).toBeNull();
    // A pairing made while the write was out (a replayed sheet add) is the newer act: it stands.
    const newer = pairMiss("0999999999999", OTHER);
    expect(pairingAfterRemoval(newer, TEA, false, pairMiss(SHELF, TEA))).toBe(newer);
  });

  it("a LANDED removal never restores — the item is gone", () => {
    expect(pairingAfterRemoval(null, TEA, true, pairMiss(SHELF, TEA))).toBeNull();
  });
});

describe("pairingAfterUndo — the Undo takes back the pairing its OWN add made", () => {
  it("CODEX R4 (4240341730) — an add that stepped an existing line ×1 → ×2, undone to ×1: its pairing goes", () => {
    // The line stays (×1, the unit the basket held before), but the act the pairing notes — "you
    // added TEA for this code" — was reversed. MUTATION: keep it unless the line is gone → the
    // re-read jar is still announced as an add the shopper undid; red.
    const made = pairMiss(SHELF, TEA);
    expect(pairingAfterUndo(made, { barcode: TEA, miss: SHELF }, false)).toBeNull();
  });

  it("a pairing an EARLIER add made stays while its item does — that add was not undone", () => {
    // An earlier sheet add paired SHELF → TEA and its window closed; a second TEA, added from a sheet
    // no miss opened, is undone ×2 → ×1. MUTATION: drop any pairing to the item → the first jar's true
    // note is lost and its re-read is a miss again; red.
    const earlier = pairMiss(SHELF, TEA);
    expect(pairingAfterUndo(earlier, { barcode: TEA, miss: null }, false)).toBe(earlier);
    expect(pairingAfterUndo(earlier, { barcode: TEA, miss: "0999999999999" }, false)).toBe(earlier);
  });

  it("an Undo that emptied the line spends ANY pairing to the item", () => {
    // MUTATION: only the pairing the add made → an older pairing to an item no longer in the basket
    // stands; red.
    expect(pairingAfterUndo(pairMiss(SHELF, TEA), { barcode: TEA, miss: null }, true)).toBeNull();
  });

  it("an Undo of another item never touches the pairing", () => {
    const pairing = pairMiss(SHELF, TEA);
    expect(pairingAfterUndo(pairing, { barcode: OTHER, miss: SHELF }, false)).toBe(pairing);
    expect(pairingAfterUndo(pairing, { barcode: OTHER, miss: null }, true)).toBe(pairing);
  });
});
