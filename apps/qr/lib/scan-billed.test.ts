import { describe, expect, it } from "vitest";
import { classifyScan } from "./scan-gate";
import { afterCharge, afterRemoval, chargeMark, NO_BILLED, type BilledLedger } from "./scan-billed";

/**
 * M186 · G25 — the charge record the camera's repeat rule reads (lib/scan-billed.ts). Each rule is
 * falsified by a value, and the rows end where the money does: `classifyScan` over the record —
 * `add` is a second charge, `repeat` a refusal.
 */
const JAR = "012345678905";
const RICE = "076808280357";
const line = (barcode: string) => ({ barcode });
const judge = (l: BilledLedger, code: string) =>
  classifyScan({ lines: [], queued: [], billed: [...l.billed] }, code).kind;

describe("afterCharge — an ok charge is recorded, unless nothing can say it stands", () => {
  it("no view came back: recorded, and the basket is re-read", () => {
    const m = chargeMark(NO_BILLED, JAR);
    const r = afterCharge(NO_BILLED, JAR, m, null);
    expect([...r.ledger.billed]).toEqual([JAR]);
    expect(r.reread).toBe(true);
    // MUTANT scan-billed/an-unseen-charge-is-not-reread — the total leaves the item out until the
    // shopper happens to leave and come back.
    expect(judge(r.ledger, JAR)).toBe("repeat");
  });

  it("its own view holds the code: recorded, nothing to re-read", () => {
    const r = afterCharge(NO_BILLED, JAR, chargeMark(NO_BILLED, JAR), [line(RICE), line(JAR)]);
    expect([...r.ledger.billed]).toEqual([JAR]);
    expect(r.reread).toBe(false);
  });

  it("its own view does NOT hold the code (an idempotent replay of a line since removed): not charged — and an older record of it goes too (Codex P2 on #344)", () => {
    const before: BilledLedger = { billed: new Set([JAR, RICE]), removals: new Map() };
    const r = afterCharge(before, JAR, chargeMark(before, JAR), [line(RICE)]);
    // MUTANT scan-billed/the-view-is-not-consulted — the camera refuses the jar for good.
    // MUTANT scan-billed/an-absent-view-keeps-a-stale-record — the same, through the older record.
    expect([...r.ledger.billed]).toEqual([RICE]);
    expect(r.reread).toBe(false);
    expect(judge(r.ledger, JAR)).toBe("add");
    expect(judge(r.ledger, RICE)).toBe("repeat"); // another item's record is untouched
  });

  it("a removal CROSSED the write (the blind pass on #344, CRITICAL): never recorded — the view is re-read", () => {
    const at = chargeMark(NO_BILLED, JAR); // dispatched…
    const removed = afterRemoval(NO_BILLED, JAR); // …the shopper taps Remove while it is in flight…
    // …and the add lands with a view read BEFORE the removal, still holding the jar.
    const r = afterCharge(removed, JAR, at, [line(JAR)]);
    // MUTANT scan-billed/a-crossing-removal-is-ignored — "Already added" for a jar the basket no
    // longer holds, forever.
    expect(r.ledger.billed.has(JAR)).toBe(false);
    expect(judge(r.ledger, JAR)).toBe("add");
    // MUTANT scan-billed/a-crossed-charge-is-not-reread — nothing then settles the list.
    expect(r.reread).toBe(true);
  });

  it("a removal of ANOTHER item, or one before the dispatch, does not cross this charge", () => {
    const removedRice = afterRemoval(NO_BILLED, RICE);
    expect(
      afterCharge(removedRice, JAR, chargeMark(removedRice, JAR), null).ledger.billed.has(JAR),
    ).toBe(true);
    const removedJar = afterRemoval(NO_BILLED, JAR);
    // Dispatched AFTER the removal: its mark is the removal's generation, so it is recorded.
    expect(
      afterCharge(removedJar, JAR, chargeMark(removedJar, JAR), null).ledger.billed.has(JAR),
    ).toBe(true);
  });
});

describe("afterRemoval — a removed item is a new item again, and every removal is a new generation", () => {
  it("drops the record and bumps the generation, every time", () => {
    const billed = afterCharge(NO_BILLED, JAR, 0, null).ledger;
    const once = afterRemoval(billed, JAR);
    // MUTANT scan-billed/a-removal-keeps-the-record — the removed jar is refused as a repeat.
    expect(once.billed.has(JAR)).toBe(false);
    expect(judge(once, JAR)).toBe("add");
    // MUTANT scan-billed/a-removal-does-not-bump — a removal no charge in flight can see.
    expect(chargeMark(once, JAR)).toBe(1);
    const twice = afterRemoval(once, JAR);
    // MUTANT scan-billed/a-removal-pins-the-generation — the SECOND removal crossing a charge
    // dispatched after the first is invisible.
    expect(chargeMark(twice, JAR)).toBe(2);
    const dispatched = chargeMark(once, JAR);
    expect(afterCharge(twice, JAR, dispatched, [line(JAR)]).ledger.billed.has(JAR)).toBe(false);
    expect(chargeMark(twice, RICE)).toBe(0); // per item
  });

  it("never mutates the ledger it was given (the page swaps the ref, it never edits in place)", () => {
    const start: BilledLedger = { billed: new Set([JAR]), removals: new Map([[JAR, 3]]) };
    afterRemoval(start, JAR);
    afterCharge(start, RICE, 0, null);
    expect([...start.billed]).toEqual([JAR]);
    expect(start.removals.get(JAR)).toBe(3);
    expect(NO_BILLED.billed.size).toBe(0);
    expect(NO_BILLED.removals.size).toBe(0);
  });
});
