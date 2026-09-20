import { describe, expect, it } from "vitest";
import { holdSubject, type SheetSubjectState } from "../sheet-subject";

/**
 * M76 — the hold-through-exit transition, value-falsified. Each rule is one case; the mutation
 * that breaks it is named where the assertion lives.
 */
const closed: SheetSubjectState<string> = { held: null, open: false, key: 0 };

describe("holdSubject — the sheet's subject through its exit", () => {
  it("opening advances the key and holds the live subject", () => {
    const s = holdSubject(closed, "a");
    // MUTATION: `key: prev.key` on the open edge — a reopen reuses the previous instance, red.
    expect(s).toEqual({ held: "a", open: true, key: 1 });
  });

  it("a re-render while open keeps the key (no remount) and follows the live subject", () => {
    const opened = holdSubject(closed, "a");
    // MUTATION: always `prev.key + 1` — every parent re-render remounts the open sheet, red.
    expect(holdSubject(opened, "a").key).toBe(1);
    // The parent refreshed the object: the sheet must see it, the instance must not restart.
    expect(holdSubject(opened, "a2")).toEqual({ held: "a2", open: true, key: 1 });
  });

  it("closing keeps the LAST subject for the exit and does not touch the key", () => {
    const opened = holdSubject(closed, "a");
    const exiting = holdSubject(opened, null);
    // MUTATION: `held: null` on close — the exiting sheet renders nothing and cuts, red.
    expect(exiting).toEqual({ held: "a", open: false, key: 1 });
    // MUTATION: advance the key on close — the exiting instance is replaced mid-slide, red.
    expect(holdSubject(exiting, null).key).toBe(1);
  });

  it("the next open is a fresh instance (a new key), even for the same subject", () => {
    const again = holdSubject(holdSubject(holdSubject(closed, "a"), null), "a");
    expect(again).toEqual({ held: "a", open: true, key: 2 });
  });
});
