import { describe, expect, it } from "vitest";
import { classifyScan } from "./scan-gate";
import {
  afterCharge,
  afterRemoval,
  afterView,
  chargeMark,
  NO_BILLED,
  type BilledLedger,
} from "./scan-billed";

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
    const before: BilledLedger = {
      billed: new Set([JAR, RICE]),
      removals: new Map(),
      charges: new Map(),
    };
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

  it("CODEX P1 on #344 — an OLDER charge's empty view never drops the record a NEWER charge of the code left", () => {
    // An idempotent replay leaves (its view will be read on an empty basket)…
    const older = chargeMark(NO_BILLED, JAR);
    // …a Browse add of the same jar leaves after it and lands first, with no view: recorded.
    const newer = afterCharge(NO_BILLED, JAR, chargeMark(NO_BILLED, JAR), null).ledger;
    expect(judge(newer, JAR)).toBe("repeat");
    // …then the replay lands with its empty view, at the same removal generation.
    const r = afterCharge(newer, JAR, older, []);
    // MUTANT scan-billed/an-older-view-drops-a-newer-charge — all three sources empty, the next
    // sighting charges another unit.
    expect(r.ledger.billed.has(JAR)).toBe(true);
    expect(judge(r.ledger, JAR)).toBe("repeat");
    // The view is older than the newer charge's write — only a fresh read can settle the list.
    // MUTANT scan-billed/an-older-view-is-not-reread.
    expect(r.reread).toBe(true);
    // A newer charge of ANOTHER code does not shield this one: its own empty view still drops it.
    const other = afterCharge(newer, RICE, chargeMark(newer, RICE), null).ledger;
    const own = chargeMark(other, JAR);
    expect(afterCharge(other, JAR, own, [line(RICE)]).ledger.billed.has(JAR)).toBe(false);
  });

  it("a CROSSED charge still counts as landed: a later empty view, read before it committed, re-reads", () => {
    const a = chargeMark(NO_BILLED, JAR); // charge A leaves…
    const removed = afterRemoval(NO_BILLED, JAR); // …the shopper removes the jar…
    const b = chargeMark(removed, JAR); // …charge B leaves after the removal…
    const afterA = afterCharge(removed, JAR, a, [line(JAR)]).ledger; // A lands, crossed: unrecorded
    expect(afterA.billed.has(JAR)).toBe(false);
    // B lands with an empty view read before A committed: A is a charge B never saw.
    // MUTANT scan-billed/a-crossed-charge-is-not-counted — the list keeps a view that may omit A.
    expect(afterCharge(afterA, JAR, b, []).reread).toBe(true);
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
    const billed = afterCharge(NO_BILLED, JAR, chargeMark(NO_BILLED, JAR), null).ledger;
    const once = afterRemoval(billed, JAR);
    // MUTANT scan-billed/a-removal-keeps-the-record — the removed jar is refused as a repeat.
    expect(once.billed.has(JAR)).toBe(false);
    expect(judge(once, JAR)).toBe("add");
    // MUTANT scan-billed/a-removal-does-not-bump — a removal no charge in flight can see.
    expect(chargeMark(once, JAR).removals).toBe(1);
    const twice = afterRemoval(once, JAR);
    // MUTANT scan-billed/a-removal-pins-the-generation — the SECOND removal crossing a charge
    // dispatched after the first is invisible.
    expect(chargeMark(twice, JAR).removals).toBe(2);
    const dispatched = chargeMark(once, JAR);
    expect(afterCharge(twice, JAR, dispatched, [line(JAR)]).ledger.billed.has(JAR)).toBe(false);
    expect(chargeMark(twice, RICE).removals).toBe(0); // per item
  });

  it("never mutates the ledger it was given (the page swaps the ref, it never edits in place)", () => {
    const start: BilledLedger = {
      billed: new Set([JAR]),
      removals: new Map([[JAR, 3]]),
      charges: new Map([[JAR, 2]]),
    };
    afterRemoval(start, JAR);
    afterCharge(start, RICE, chargeMark(start, RICE), null);
    afterCharge(start, JAR, chargeMark(start, JAR), [line(JAR)]);
    expect([...start.billed]).toEqual([JAR]);
    expect(start.removals.get(JAR)).toBe(3);
    expect(start.charges.get(JAR)).toBe(2);
    expect(NO_BILLED.billed.size).toBe(0);
    expect(NO_BILLED.removals.size).toBe(0);
    expect(NO_BILLED.charges.size).toBe(0);
  });
});

describe("afterView — an APPLIED view drops every record it does not hold (Codex on #344's c03743f)", () => {
  const ledger: BilledLedger = {
    billed: new Set([JAR, RICE]),
    removals: new Map([[JAR, 2]]),
    charges: new Map([[JAR, 3]]),
  };

  it("drops a recorded code the view lacks — the camera may charge that jar again", () => {
    const after = afterView(ledger, [line(RICE)]);
    // MUTANT scan-billed/after-view-keeps-what-the-view-lacks — an idempotent replay's record (no
    // view of its own) outlives the read that shows the basket without it: refused for good.
    expect([...after.billed]).toEqual([RICE]);
    expect(judge(after, JAR)).toBe("add");
    // The removal generation and the landed charges are the ledger's history, not the view's.
    expect(after.removals).toBe(ledger.removals);
    expect(after.charges).toBe(ledger.charges);
  });

  it("keeps every recorded code the view holds", () => {
    const after = afterView(ledger, [line(RICE), line(JAR)]);
    // MUTANT scan-billed/after-view-drops-what-the-view-holds — the camera re-charges a jar on screen.
    expect([...after.billed].sort()).toEqual([JAR, RICE].sort());
    expect(judge(after, JAR)).toBe("repeat");
    expect(judge(afterView(ledger, [line(JAR)]), JAR)).toBe("repeat");
  });

  it("returns the SAME ledger when the view drops nothing (no needless churn), and never mutates it", () => {
    expect(afterView(ledger, [line(JAR), line(RICE), line("000000000000")])).toBe(ledger);
    expect(afterView(NO_BILLED, [])).toBe(NO_BILLED);
    afterView(ledger, []);
    expect([...ledger.billed].sort()).toEqual([JAR, RICE].sort());
  });
});
