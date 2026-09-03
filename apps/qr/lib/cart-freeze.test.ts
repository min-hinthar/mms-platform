import { describe, expect, it } from "vitest";
import {
  type CartFreeze,
  cartFreeze,
  classifyRefusedWrite,
  freezeBlocksEdits,
  freezeBlocksPayment,
  freezeNotice,
  refusalIsFreeze,
  refusedWriteNotice,
  reopenFailureNotice,
  SETTLING_NOTICE,
  visibleFreeze,
} from "./cart-freeze";

/**
 * J4 (residual) — the defect is an ASYMMETRY, so the tests are written as a comparison against the
 * server's own predicate rather than as a list of return values.
 *
 * `cart.ts` refuses on bare `locked` at eleven sites, none of them comparing the holder to the
 * caller. Every case below asks the same question: does this binding block exactly when the server
 * would? A test that only checked "self returns 'self'" would pass against a version that then let
 * the component render the cart editable — which is the shipped defect.
 */

const SEAT = "seat-me";
const PEER = "seat-other";

describe("cartFreeze — blocking is decided before attribution", () => {
  it("an unlocked cart is editable regardless of who the seats are", () => {
    expect(cartFreeze({ locked: false, lockedBy: null, mySeat: SEAT })).toBeNull();
    // A stale `lockedBy` on an unlocked cart must not manufacture a freeze: `releaseCartLock` nulls
    // all three columns together, but a thin read could leave the holder set with `locked` false.
    expect(cartFreeze({ locked: false, lockedBy: PEER, mySeat: SEAT })).toBeNull();
  });

  it("THE DEFECT: a lock held by MY OWN seat still freezes the cart", () => {
    // This is J4's residual in one line. `lockedByPeer` was false here, so every control rendered
    // live while `cart.ts:52` threw on every write and the catch swallowed it.
    // MUTATION: return null for the self case → this fails, and the silent-no-op screen is back.
    const freeze = cartFreeze({ locked: true, lockedBy: SEAT, mySeat: SEAT });
    expect(freeze).toBe("self");
    expect(freezeBlocksEdits(freeze)).toBe(true);
  });

  it("a peer's lock freezes it too, and is the only case that names anyone", () => {
    const freeze = cartFreeze({ locked: true, lockedBy: PEER, mySeat: SEAT });
    expect(freeze).toBe("peer");
    expect(freezeBlocksEdits(freeze)).toBe(true);
  });

  it("an unattributable holder still freezes — a lock we cannot explain is still a lock", () => {
    // MUTATION: return null when the holder or seat is unknown → a thin read re-opens the exact
    // silent-refusal screen, on the path `cart/page.tsx` is most likely to produce.
    for (const v of [
      { locked: true, lockedBy: null, mySeat: SEAT },
      { locked: true, lockedBy: PEER, mySeat: null },
      { locked: true, lockedBy: null, mySeat: null },
    ]) {
      expect(cartFreeze(v)).toBe("held");
      expect(freezeBlocksEdits(cartFreeze(v))).toBe(true);
    }
  });

  it("PARITY: it blocks exactly when the server's bare `locked` would — no wider, no narrower", () => {
    // The server predicate, verbatim from cart.ts (`if (locked) …`), with no holder comparison.
    const serverRefuses = (v: { locked: boolean }) => v.locked;
    // MUTATION: narrow any arm to a holder comparison (the `lockedByPeer` shape) → the self and
    // held rows disagree and this fails. That is the whole defect, expressed as a table.
    for (const locked of [true, false]) {
      for (const lockedBy of [null, SEAT, PEER]) {
        for (const mySeat of [null, SEAT]) {
          const v = { locked, lockedBy, mySeat };
          expect(freezeBlocksEdits(cartFreeze(v))).toBe(serverRefuses(v));
        }
      }
    }
  });
});

describe("freezeNotice — says only what these three fields prove", () => {
  it("names the peer, because that is the one case a name is established for", () => {
    expect(freezeNotice("peer", "Ko Ko", true)).toBe(
      "Ko Ko is checking out — the order’s locked for a moment.",
    );
  });

  it("falls back to 'Someone' rather than rendering an empty name", () => {
    expect(freezeNotice("peer", null, true)).toBe(
      "Someone is checking out — the order’s locked for a moment.",
    );
  });

  it("THE COPY RULE: a self lock never borrows `superseded`'s vocabulary", () => {
    // `superseded` is a DIFFERENT fact, established only by a release that succeeded and matched
    // nothing (`classifyZeroRow`). These three fields cannot prove a takeover, and claiming one is
    // the fabricated-diagnosis class M116/M119 removed. A declined card reaches a zero-row release
    // with nobody having taken anything over, which is exactly why the two must not share words.
    // MUTATION: reuse editOrder's "Another tab took over this checkout" here → this fails.
    const notice = freezeNotice("self", null, true);
    expect(notice).toBeTruthy();
    for (const forbidden of ["took over", "another tab", "superseded", "someone else"]) {
      expect(notice!.toLowerCase()).not.toContain(forbidden);
    }
    // And it must point at the way out, since the state is recoverable.
    expect(notice!.toLowerCase()).toContain("reopen");
  });

  it("an unattributable lock attributes it to nobody", () => {
    const notice = freezeNotice("held", null, true);
    expect(notice).toBeTruthy();
    // MUTATION: fall back to the peer sentence for `held` → "Someone is checking out" is a claim
    // about a person, made from a read that did not tell us there was one.
    for (const forbidden of ["someone", "ko ko", "is checking out"]) {
      expect(notice!.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("an editable cart has nothing to announce", () => {
    expect(freezeNotice(null, "Ko Ko", true)).toBeNull();
  });

  it("every blocking state has a sentence — a frozen screen is never silent", () => {
    // The a11y half: the lockbar and the live-region announcement both render this, so a null here
    // would take the screen read-only with nothing said. MUTATION: return null for `held` → fails.
    for (const f of ["peer", "self", "held"] as const) {
      expect(freezeNotice(f, null, true)).toBeTruthy();
      expect(freezeNotice(f, null, false)).toBeTruthy();
    }
  });
});

describe("freezeNotice — the self sentence tracks whether a release is even possible", () => {
  it("THE INERT-BUTTON CASE: with no attempt token, it does not promise a reopen", () => {
    // Codex P2 on #246. `releasePayAttempt` fails closed without an era, by design (M124), and a
    // SECOND tab on the same device never minted one — it shares the uid from the cookie session,
    // so it sees the lock as its own and cannot name it. Offering "reopen it" there described a
    // button that could only ever call refresh(): worse than no button.
    // MUTATION: ignore `canRelease` and always return the reopen sentence → this fails.
    const notice = freezeNotice("self", null, false);
    expect(notice).toBeTruthy();
    expect(notice!.toLowerCase()).not.toContain("reopen");
  });

  it("...and it still must not claim a takeover, or name anyone", () => {
    // The tokenless sentence is the one most tempting to write as "another tab took over" — it is
    // literally about another tab. But that is `superseded`, which only `classifyZeroRow`
    // establishes, and this state does not establish it: the other tab may be idle on a review step.
    const notice = freezeNotice("self", "Ko Ko", false)!;
    for (const forbidden of ["took over", "superseded", "someone else", "ko ko"]) {
      expect(notice.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("with a token, it points at the way out", () => {
    expect(freezeNotice("self", null, true)!.toLowerCase()).toContain("reopen");
  });

  it("canRelease changes ONLY the self case — peer and held are untouched", () => {
    // MUTATION: branch on `canRelease` in the peer or held arm → these fail. Those two sentences
    // are about someone else's lock or an unattributable one; whether WE hold a token says nothing
    // about either, and letting it leak in would be a claim built from an unrelated fact.
    expect(freezeNotice("peer", "Ko Ko", true)).toBe(freezeNotice("peer", "Ko Ko", false));
    expect(freezeNotice("held", null, true)).toBe(freezeNotice("held", null, false));
  });
});

describe("freezeBlocksPayment — the tip follows the PAY gate, not the EDIT gate", () => {
  it("only a peer's lock stops the payment", () => {
    // `acquireCartLock`'s `.or(locked_by.eq.<uid>)` lets the SAME uid re-acquire, so a self lock is
    // not a refusal — Pay is the diner's escape hatch out of it. MUTATION: return `freeze !== null`
    // (i.e. reuse freezeBlocksEdits) → this fails, and the self-frozen diner can pay only with
    // whatever tip was already selected, which is the Codex round-2 defect.
    expect(freezeBlocksPayment("peer")).toBe(true);
    expect(freezeBlocksPayment("self")).toBe(false);
    expect(freezeBlocksPayment("held")).toBe(false);
    expect(freezeBlocksPayment(null)).toBe(false);
  });

  it("IT IS STRICTLY NARROWER THAN THE EDIT GATE — never wider", () => {
    // The direction is the invariant. A freeze that stops the payment must also stop the edits: the
    // pay screen may never refuse where the cart is fully editable, because then it is refusing
    // something the server would accept. The converse is allowed and is the whole point — a control
    // that only feeds create-intent stays live where a cart WRITE is refused.
    for (const f of ["peer", "self", "held", null] as const) {
      if (freezeBlocksPayment(f)) expect(freezeBlocksEdits(f)).toBe(true);
    }
    // The implication above is satisfied by a gate that blocks everything, so name the two rows that
    // actually distinguish the predicates. MUTATION: widen either to `freeze !== null` → these fail.
    expect(freezeBlocksEdits("self")).toBe(true);
    expect(freezeBlocksPayment("self")).toBe(false);
    expect(freezeBlocksEdits("held")).toBe(true);
    expect(freezeBlocksPayment("held")).toBe(false);
  });
});

describe("visibleFreeze — suppress only a lock THIS request took", () => {
  const inFlight = (freeze: CartFreeze, freezeAtRequestStart: CartFreeze) =>
    visibleFreeze({ freeze, payRequestInFlight: true, freezeAtRequestStart });

  it("hides the bar for the lock create-intent just acquired for us", () => {
    // The cart was editable when Pay was pressed, so a self lock appearing mid-request is ours.
    // MUTATION: return `freeze` unconditionally → a `--warn` bar paints under "Starting checkout…".
    expect(inFlight("self", null)).toBeNull();
  });

  it("THE REGRESSION: a self lock that was ALREADY there keeps its bar", () => {
    // Codex round 2 on #246. Second tab on one device: the freeze is self BEFORE Pay is pressed, and
    // Pay is deliberately live (freezeBlocksPayment). Suppressing here re-enabled every edit control
    // and announced "the order's unlocked" while the other tab still held the lock.
    // MUTATION: drop the `freezeAtRequestStart` term → this fails.
    expect(inFlight("self", "self")).toBe("self");
    // Same for a lock that was unattributable and has since resolved to us — still not ours to hide.
    expect(inFlight("self", "held")).toBe("self");
    expect(inFlight("self", "peer")).toBe("self");
  });

  it("never suppresses a peer's lock or an unattributable one", () => {
    // create-intent answers 409 held_by_other behind a peer's lock, and `held` is by definition a
    // lock we cannot claim. MUTATION: suppress on any freeze while in flight → these fail.
    expect(inFlight("peer", null)).toBe("peer");
    expect(inFlight("held", null)).toBe("held");
  });

  it("with no request in flight it is the identity", () => {
    for (const f of ["peer", "self", "held", null] as const) {
      expect(
        visibleFreeze({ freeze: f, payRequestInFlight: false, freezeAtRequestStart: null }),
      ).toBe(f);
    }
  });
});

describe("reopenFailureNotice — every outcome of the recovery control is reported", () => {
  it("a release that LANDED says nothing — the refreshed cart is the message", () => {
    expect(reopenFailureNotice({ released: true })).toBeNull();
  });

  it("THE SILENT NO-OP: every non-success outcome gets a sentence", () => {
    // Codex round 3 on #246. `reopenOrder` rendered only `superseded`, so a rate-limited or failed
    // release flipped the button to "Reopening…" and back with the bar still up and nothing said —
    // J4's clause (b) reappearing on the control built to fix J4's clause (b).
    // MUTATION: return null for any of these → this fails.
    for (const reason of ["superseded", "not_held", "rate_limited", "error", "unknown"]) {
      expect(reopenFailureNotice({ released: false, reason })).toBeTruthy();
    }
  });

  it("only `superseded` may claim a takeover — the other four must not", () => {
    // The fabricated-diagnosis rule (M116/M119) applied to this surface: `superseded` is the only
    // reason `classifyZeroRow` establishes a live successor for. A rate-limit or a transport error
    // is OUR outage and says nothing about anyone's tab.
    expect(reopenFailureNotice({ released: false, reason: "superseded" })!).toContain("took over");
    for (const reason of ["not_held", "rate_limited", "error", "unknown"]) {
      const notice = reopenFailureNotice({ released: false, reason })!.toLowerCase();
      for (const forbidden of ["took over", "another tab", "someone else", "superseded"]) {
        expect(notice).not.toContain(forbidden);
      }
    }
  });

  it("an unrecognised reason still says something rather than falling through to silence", () => {
    // A new reason added to `PayLockRelease` must not silently re-open the no-op. The default arm
    // is our-outage phrasing, which is the safe direction: it claims nothing about the diner's tab.
    expect(reopenFailureNotice({ released: false, reason: "brand_new_reason" })).toBeTruthy();
  });
});

/**
 * T14 — the refused-write classifier. These are the M116 rules, so every case asks "what did the
 * code ESTABLISH?" rather than "what does this arm return".
 *
 * The shipped defect was one answer for four states: `TableCartProvider` flashed "Reconnecting to
 * your table…" and re-minted the session for every throw out of `addItem`/`setQty`, including the
 * lock its own comment listed as a cause. So the load-bearing assertions below are the SEPARATIONS
 * — a state must not borrow another's vocabulary or its recovery.
 */
const OK = (over: Partial<{ locked: boolean; lockedBy: string | null; settling: boolean }> = {}) =>
  ({
    ok: true as const,
    freeze: {
      locked: over.locked ?? false,
      lockedBy: over.lockedBy ?? null,
      mySeat: SEAT,
    },
    settling: over.settling ?? false,
  }) satisfies Parameters<typeof classifyRefusedWrite>[0];

describe("classifyRefusedWrite — the cause is re-established, never guessed", () => {
  it("a failed re-read is the ONLY state that means a session problem", () => {
    expect(classifyRefusedWrite({ ok: false })).toEqual({ cause: "session" });
    // MUTATION: make any successful-re-read arm answer `session` → this fails. That mutation IS the
    // shipped defect: it is what a single unconditional `revalidate()` in the catch amounts to.
    for (const reread of [OK(), OK({ locked: true, lockedBy: PEER }), OK({ settling: true })]) {
      expect(classifyRefusedWrite(reread).cause).not.toBe("session");
    }
  });

  it("a locked cart is named as locked, with the freeze the viewer actually has", () => {
    expect(classifyRefusedWrite(OK({ locked: true, lockedBy: PEER }))).toEqual({
      cause: "frozen",
      freeze: "peer",
    });
    expect(classifyRefusedWrite(OK({ locked: true, lockedBy: SEAT }))).toEqual({
      cause: "frozen",
      freeze: "self",
    });
    // An unattributable lock is still a lock — the `held` case, which blocks like the others.
    expect(classifyRefusedWrite(OK({ locked: true, lockedBy: null }))).toEqual({
      cause: "frozen",
      freeze: "held",
    });
  });

  it("locked BEATS settling, because the server tests them in that order", () => {
    // `addItem`/`setQty` both do `if (locked) throw …` then `if (settling) throw …`, so a cart that
    // is both was refused as LOCKED and must be named that way. Naming the settle here would report
    // a reason the server did not act on.
    expect(classifyRefusedWrite(OK({ locked: true, lockedBy: PEER, settling: true })).cause).toBe(
      "frozen",
    );
  });

  it("a settling table is its own answer, not a shade of the lock", () => {
    expect(classifyRefusedWrite(OK({ settling: true }))).toEqual({ cause: "settling" });
  });

  it("an editable cart answers `unknown` — it must not manufacture a freeze OR a session failure", () => {
    // The refusal was real (the caller is in a catch) but this client cannot see why: a sold-out
    // line, a stale modifier, a line owned by someone else. Both neighbours would be fabrications.
    expect(classifyRefusedWrite(OK())).toEqual({ cause: "unknown" });
  });
});

describe("refusalIsFreeze — the gate, and the over-blocking direction", () => {
  it("is true for exactly the two states the server refuses on", () => {
    expect(refusalIsFreeze(classifyRefusedWrite(OK({ locked: true, lockedBy: PEER })))).toBe(true);
    expect(refusalIsFreeze(classifyRefusedWrite(OK({ settling: true })))).toBe(true);
  });

  it("is FALSE for `unknown` and `session` — this predicate also runs as a PRE-write gate", () => {
    // ⚠️ THE EXPENSIVE DIRECTION. `TableCartProvider` calls this against the freeze it already holds
    // to refuse a tap without a round trip; answering true for `unknown` would block every write on
    // a cart the server would have accepted — the `computeDeliveryGate` failure this repo has paid
    // for before, where a bare `!isOpen` folded into a submit gate disabled a whole valid window.
    expect(refusalIsFreeze(classifyRefusedWrite(OK()))).toBe(false);
    expect(refusalIsFreeze(classifyRefusedWrite({ ok: false }))).toBe(false);
  });
});

describe("refusedWriteNotice — each sentence says only what its arm established", () => {
  it("the lock sentence comes from `freezeNotice`, not a second copy", () => {
    for (const [lockedBy, peerName] of [
      [PEER, "Ko Ko"],
      [SEAT, null],
      [null, null],
    ] as const) {
      const refusal = classifyRefusedWrite(OK({ locked: true, lockedBy }));
      const freeze = (refusal as { cause: "frozen"; freeze: Exclude<CartFreeze, null> }).freeze;
      // MUTATION: hand-write any lock sentence here → this fails. /menu and the review step must
      // never describe one lock two ways.
      expect(refusedWriteNotice(refusal, peerName)).toBe(freezeNotice(freeze, peerName, false));
    }
  });

  it("only the `session` arm may mention reconnecting — that is the only arm that re-mints", () => {
    expect(refusedWriteNotice({ cause: "session" }, null).toLowerCase()).toContain("reconnect");
    for (const refusal of [
      classifyRefusedWrite(OK({ locked: true, lockedBy: PEER })),
      classifyRefusedWrite(OK({ settling: true })),
      classifyRefusedWrite(OK()),
    ]) {
      expect(refusedWriteNotice(refusal, "Ko Ko").toLowerCase()).not.toContain("reconnect");
    }
  });

  it("`unknown` claims no cause at all — no lock, no table, no connection", () => {
    const notice = refusedWriteNotice({ cause: "unknown" }, "Ko Ko").toLowerCase();
    for (const forbidden of ["lock", "checking out", "reconnect", "splitting", "session"]) {
      expect(notice).not.toContain(forbidden);
    }
    // …but it still says something. Silence here is the no-op this whole row is about.
    expect(notice.length).toBeGreaterThan(0);
  });

  it("the settle sentence is the SHARED constant the transition announcement uses", () => {
    // `TableCartProvider`'s settle-edge effect renders `SETTLING_NOTICE` too, so a refusal and a
    // transition cannot describe one freeze two ways.
    expect(refusedWriteNotice({ cause: "settling" }, null)).toBe(SETTLING_NOTICE);
  });

  it("every arm returns a non-empty sentence", () => {
    for (const refusal of [
      { cause: "frozen", freeze: "peer" },
      { cause: "settling" },
      { cause: "session" },
      { cause: "unknown" },
    ] as const) {
      expect(refusedWriteNotice(refusal, null)).toBeTruthy();
    }
  });
});
