import { describe, expect, it } from "vitest";
import { classifyScan, type ScanBasket } from "./scan-gate";
import { judgedBarcode, pairMiss, pairingAfterVerdict, pairingWithout } from "./scan-pairing";

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
