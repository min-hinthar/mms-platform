import { describe, expect, it } from "vitest";
import {
  mayClaimLanding,
  mayRetry,
  recoveredWrite,
  threadableView,
  unconfirmedWriteNotice,
  unsentWriteNotice,
  type WriteResult,
} from "./write-outcome";

/**
 * T26 — the three states, and specifically the arms that used to be ONE null.
 *
 * Every case below is a shape Codex verified against source on #250 (rounds 3 and 4). The fixtures
 * are deliberately distinguishable: a list that is non-empty, so "returned the view" and "returned
 * nothing" can never accidentally agree.
 */

const VIEW = [{ id: "line-1", qty: 2 }];
const APPLIED: WriteResult<typeof VIEW> = { state: "applied", view: VIEW };
const UNCONFIRMED: WriteResult<typeof VIEW> = { state: "unconfirmed" };
const REFUSED: WriteResult<typeof VIEW> = { state: "refused", view: VIEW };
const REFUSED_NO_CART: WriteResult<typeof VIEW> = { state: "refused", view: null };

describe("recoveredWrite — what one recovery re-read establishes", () => {
  it("a re-read that could not see the cart is UNCONFIRMED, never refused", () => {
    // The `YourUsual` duplicate-charge path: a response lost after the row committed is
    // indistinguishable from a refusal, and only one of the two ways to be wrong costs money.
    expect(recoveredWrite({ reread: null, landed: null })).toEqual({ state: "unconfirmed" });
  });

  it("an unattributable delta on a SUCCESSFUL read is UNCONFIRMED, never refused", () => {
    // Codex round 4: the sentinel was wrong even when nothing was broken — a concurrent same-dish
    // edit makes the delta ambiguous, and ambiguity is not evidence of a refusal.
    expect(recoveredWrite({ reread: VIEW, landed: null })).toEqual({ state: "unconfirmed" });
  });

  it("a read that shows the write landed is APPLIED, and carries that exact view", () => {
    const r = recoveredWrite({ reread: VIEW, landed: true });
    expect(r).toEqual({ state: "applied", view: VIEW });
    // The view must be the one we read, not a copy assembled from somewhere else.
    expect(threadableView(r)).toBe(VIEW);
  });

  it("a read that shows the write is NOT in the cart is the only refusal — and it KEEPS that read", () => {
    // Codex round 2 on #251 (P1): the refusal is established BY this read, so it is the freshest
    // view anyone has. Discarding it sent the caller back to a stale local snapshot.
    expect(recoveredWrite({ reread: VIEW, landed: false })).toEqual({
      state: "refused",
      view: VIEW,
    });
  });

  it("a failed re-read stays unconfirmed even when the caller claims a landing", () => {
    // `landed` is only meaningful against a cart we actually read. A caller that computes it from a
    // stale snapshot must not be able to promote ignorance into a landing.
    expect(recoveredWrite({ reread: null, landed: true })).toEqual({ state: "unconfirmed" });
    expect(recoveredWrite({ reread: null, landed: false })).toEqual({ state: "unconfirmed" });
  });
});

describe("recoveredWrite — an OVERTAKEN read classifies but must not be threaded", () => {
  it("keeps the verdict and drops the snapshot", () => {
    // Codex round 3 on #251 (P1): a ticketed read can come back — establishing perfectly well
    // whether the write landed — and still lose the screen to a view applied after it was issued.
    // The classification is a fact about the moment we looked; the rows may predate the winner.
    expect(recoveredWrite({ reread: VIEW, landed: false, viewIsCurrent: false })).toEqual({
      state: "refused",
      view: null,
    });
    expect(recoveredWrite({ reread: VIEW, landed: true, viewIsCurrent: false })).toEqual({
      state: "applied",
      view: null,
    });
  });

  it("an overtaken landing may still be CLAIMED — we saw it land", () => {
    const r = recoveredWrite({ reread: VIEW, landed: true, viewIsCurrent: false });
    expect(mayClaimLanding(r)).toBe(true);
    // ...but there is nothing safe to hand the next queued write.
    expect(threadableView(r)).toBeNull();
  });

  it("an overtaken refusal is still a refusal, so it may be retried", () => {
    const r = recoveredWrite({ reread: VIEW, landed: false, viewIsCurrent: false });
    expect(mayRetry(r)).toBe(true);
  });

  it("defaults to current, so an unflagged caller is unaffected", () => {
    expect(recoveredWrite({ reread: VIEW, landed: false })).toEqual({
      state: "refused",
      view: VIEW,
    });
  });
});

describe("mayRetry — only a refusal may be re-sent", () => {
  it("is true for refused alone", () => {
    expect(mayRetry(REFUSED)).toBe(true);
  });

  it("is FALSE for unconfirmed — this is the duplicate-charge guard", () => {
    // `YourUsual` gates its resume on this. If it ever answers true for `unconfirmed`, a committed
    // dish is added twice and the diner pays for both.
    expect(mayRetry(UNCONFIRMED)).toBe(false);
  });

  it("is false for applied", () => {
    expect(mayRetry(APPLIED)).toBe(false);
  });
});

describe("threadableView — only an applied write yields a list to thread", () => {
  it("hands back the applied view", () => {
    expect(threadableView(APPLIED)).toBe(VIEW);
  });

  it("yields null for unconfirmed — the caller must not substitute its own snapshot", () => {
    // `AddButton`'s queue does `threaded ?? itemsRef.current`, and on this state `itemsRef.current`
    // holds the PRE-write quantity: the "two decrements from 3 set 2 twice" bug.
    expect(threadableView(UNCONFIRMED)).toBeNull();
  });

  it("yields the recovery view for refused — it is the freshest cart we have", () => {
    // `AddButton` threads this into the next queued op, and `setQty` is ABSOLUTE: with a stale
    // baseline a following decrement sends a wrong number rather than losing a tap. A concurrent
    // host edit 3 -> 5 during a refused write made the next "−" send 2 instead of 4.
    expect(threadableView(REFUSED)).toBe(VIEW);
  });

  it("yields null for a refusal with no cart to read", () => {
    expect(threadableView(REFUSED_NO_CART)).toBeNull();
  });

  it("unconfirmed is the ONLY state without a threadable view", () => {
    const states: WriteResult<typeof VIEW>[] = [APPLIED, UNCONFIRMED, REFUSED];
    const withoutView = states.filter((r) => threadableView(r) === null);
    expect(withoutView).toEqual([UNCONFIRMED]);
  });
});

describe("mayClaimLanding — separate from mayRetry on purpose", () => {
  it("only an applied write may be announced as landed", () => {
    expect(mayClaimLanding(APPLIED)).toBe(true);
    expect(mayClaimLanding(REFUSED)).toBe(false);
  });

  it("is FALSE for unconfirmed, which mayRetry ALSO answers false for", () => {
    // The two predicates disagree nowhere and are still not the same question: `unconfirmed` means
    // "don't re-send" AND "don't claim it". One boolean cannot carry both, and collapsing them is
    // how a write nobody retried became a spoken success.
    expect(mayClaimLanding(UNCONFIRMED)).toBe(false);
    expect(mayRetry(UNCONFIRMED)).toBe(false);
    // The pair is what separates the three states: applied is (claim, no-retry), refused is
    // (no-claim, retry), unconfirmed is (no-claim, no-retry). No two states share a pair.
    const pair = (r: WriteResult<typeof VIEW>) => `${mayClaimLanding(r)}/${mayRetry(r)}`;
    expect(new Set([pair(APPLIED), pair(UNCONFIRMED), pair(REFUSED)]).size).toBe(3);
  });
});

describe("unconfirmedWriteNotice — what to say about a write we could not see", () => {
  it("does not assert that the visible order is current", () => {
    // The sentence is reached on BOTH ways into `unconfirmed`, and on one of them the re-read
    // failed — so we have no current list. `refusedWriteNotice`'s "the order below is up to date"
    // would be a claim we cannot support, which is the class this whole slice removes.
    const notice = unconfirmedWriteNotice();
    expect(notice).not.toMatch(/up to date/i);
    // It must still say what we observed and give somewhere to go.
    expect(notice).toMatch(/couldn’t confirm/i);
    expect(notice).toMatch(/order below/i);
  });

  it("never claims the write landed", () => {
    // It replaces an optimistic "Added to your order"; repeating the claim would defeat it.
    expect(unconfirmedWriteNotice()).not.toMatch(/\badded\b/i);
  });
});

describe("unsentWriteNotice — nothing was sent, so a retry is safe", () => {
  it("is distinct from the unconfirmed notice, and only IT invites a retry", () => {
    // Codex round 6 on #251 (P1). `unconfirmed` means the request left and may have landed, so
    // inviting a retry there can double a charge. This one means nothing was sent at all — a queued
    // absolute setQty had no trustworthy baseline — so the retry is the correct offer, and the two
    // sentences must never be interchangeable.
    expect(unsentWriteNotice()).not.toBe(unconfirmedWriteNotice());
    expect(unsentWriteNotice()).toMatch(/try that again/i);
    expect(unconfirmedWriteNotice()).not.toMatch(/try that again/i);
  });

  it("says plainly that nothing changed", () => {
    // The optimistic digit has just snapped back; without this the diner sees a tap vanish with no
    // explanation. It must not claim we know the cart's state — only that we did not write to it.
    expect(unsentWriteNotice()).toMatch(/nothing changed/i);
  });
});
