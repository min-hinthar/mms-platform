import { describe, expect, it } from "vitest";
import { cartFreeze, freezeBlocksEdits, freezeNotice } from "./cart-freeze";

/**
 * J4 (residual) — the defect is an ASYMMETRY, so the tests are written as a comparison against the
 * server's own predicate rather than as a list of return values.
 *
 * `cart.ts` refuses on bare `locked` at seven sites, none of them comparing the holder to the
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
    expect(freezeNotice("peer", "Ko Ko")).toBe(
      "Ko Ko is checking out — the order’s locked for a moment.",
    );
  });

  it("falls back to 'Someone' rather than rendering an empty name", () => {
    expect(freezeNotice("peer", null)).toBe(
      "Someone is checking out — the order’s locked for a moment.",
    );
  });

  it("THE COPY RULE: a self lock never borrows `superseded`'s vocabulary", () => {
    // `superseded` is a DIFFERENT fact, established only by a release that succeeded and matched
    // nothing (`classifyZeroRow`). These three fields cannot prove a takeover, and claiming one is
    // the fabricated-diagnosis class M116/M119 removed. A declined card reaches a zero-row release
    // with nobody having taken anything over, which is exactly why the two must not share words.
    // MUTATION: reuse editOrder's "Another tab took over this checkout" here → this fails.
    const notice = freezeNotice("self", null);
    expect(notice).toBeTruthy();
    for (const forbidden of ["took over", "another tab", "superseded", "someone else"]) {
      expect(notice!.toLowerCase()).not.toContain(forbidden);
    }
    // And it must point at the way out, since the state is recoverable.
    expect(notice!.toLowerCase()).toContain("reopen");
  });

  it("an unattributable lock attributes it to nobody", () => {
    const notice = freezeNotice("held", null);
    expect(notice).toBeTruthy();
    // MUTATION: fall back to the peer sentence for `held` → "Someone is checking out" is a claim
    // about a person, made from a read that did not tell us there was one.
    for (const forbidden of ["someone", "ko ko", "is checking out"]) {
      expect(notice!.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("an editable cart has nothing to announce", () => {
    expect(freezeNotice(null, "Ko Ko")).toBeNull();
  });

  it("every blocking state has a sentence — a frozen screen is never silent", () => {
    // The a11y half: the lockbar and the live-region announcement both render this, so a null here
    // would take the screen read-only with nothing said. MUTATION: return null for `held` → fails.
    for (const f of ["peer", "self", "held"] as const) {
      expect(freezeNotice(f, null)).toBeTruthy();
    }
  });
});
