import { describe, expect, it } from "vitest";
import {
  explainedByRefusal,
  explanationHolds,
  freezeBannerSuppressed,
  type ExplainedFreeze,
  type FreezeAxis,
} from "./live-region";
import { classifyRefusedWrite, type PublishableRefusal } from "./cart-freeze";

const AXES: FreezeAxis[] = ["locked", "settling"];

/** A refusal classified by the REAL classifier, so no fixture here transcribes a cause or a freeze. */
const refusal = (freeze: { locked: boolean; lockedBy: string | null }, settling = false) =>
  classifyRefusedWrite({
    ok: true,
    freeze: { locked: freeze.locked, lockedBy: freeze.lockedBy, mySeat: "seat-me" },
    settling,
  });
const SELF_LOCK: PublishableRefusal = refusal({ locked: true, lockedBy: "seat-me" });
const PEER_LOCK: PublishableRefusal = refusal({ locked: true, lockedBy: "seat-peer" });
const SPLIT: PublishableRefusal = refusal({ locked: false, lockedBy: null }, true);

/** Every explanation a refusal can produce — the domain a rule about them must hold across. */
const EXPLAINED: ExplainedFreeze[] = [
  null,
  { axis: "settling" },
  { axis: "locked", self: true },
  { axis: "locked", self: false },
];

/** The cart frozen on exactly one axis, with the lock (when there is one) held by a PEER. */
const FROZEN = (axis: FreezeAxis) => ({
  locked: axis === "locked",
  settling: axis === "settling",
  lockedByYou: false,
});
/** Both freezes live at once — reachable, since `locked_at` and `settle_at` are independent. */
const BOTH = { locked: true, settling: true, lockedByYou: false };

const EDITABLE = { locked: false, settling: false, lockedByYou: false };

describe("freezeBannerSuppressed — a release that restores editing is never silenced", () => {
  it("speaks on EVERY release into an EDITABLE cart, whatever was explained", () => {
    // ⚠️ RULE 1, AND THE ONLY RULE HERE WHOSE FAILURE COSTS A DINER THEIR ORDER — every other one
    // can be wrong in the direction of one redundant sentence. Tested across the whole `explained`
    // domain rather than at one value for that reason: a diner never told the cart reopened keeps
    // believing it is frozen, and nothing else on /menu corrects them.
    for (const axis of AXES) {
      for (const explained of EXPLAINED) {
        expect(
          freezeBannerSuppressed({ axis, entering: false, explained, current: EDITABLE }),
        ).toBe(false);
      }
    }
  });

  it("speaks on a release into a still-frozen cart when nothing explained that freeze", () => {
    // The other half: silence is only ever justified by a LIVE explanation. With none, the banner
    // is the diner's only signal and must speak even though the cart stays read-only.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: false,
        explained: null,
        current: { locked: false, settling: true, lockedByYou: false },
      }),
    ).toBe(false);
  });

  it("is silent on a release that restores NOTHING, when a refusal already explained what remains", () => {
    // ⚠️ RULE 1 MADE PRECISE, and one of this suite's own provider tests is what forced it. The axes
    // are independent, so a pay-lock can lift while the table still settles — and that release
    // restores nothing, cannot strand anyone, and was overwriting a refusal naming both the verdict
    // and the live reason. The exemption belongs to a release that changes what the diner can DO.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: false,
        explained: { axis: "settling" },
        current: { locked: false, settling: true, lockedByYou: false },
      }),
    ).toBe(true);
  });

  it("speaks when the explanation names an axis that is no longer frozen", () => {
    expect(
      freezeBannerSuppressed({
        axis: "settling",
        entering: false,
        explained: { axis: "locked", self: false },
        current: { locked: false, settling: true, lockedByYou: false },
      }),
    ).toBe(false);
  });
});

describe("freezeBannerSuppressed — entering a freeze", () => {
  it("is silent ONLY when the same axis was explained", () => {
    for (const axis of AXES) {
      const explained: ExplainedFreeze =
        axis === "settling" ? { axis: "settling" } : { axis: "locked", self: false };
      expect(
        freezeBannerSuppressed({ axis, entering: true, explained, current: FROZEN(axis) }),
      ).toBe(true);
    }
  });

  it("is silent for the NARROWER axis when the WIDER one was explained", () => {
    // ⚠️ PRECEDENCE, NOT EQUALITY — the cell an equality rule gets wrong. Both freezes can enter on
    // ONE applied view, `classifyRefusedWrite` tests settling FIRST, so the refusal explains
    // `settling` — and the LOCK banner (whose effect is declared first, so its callback runs first)
    // would take the slot under equality. The region would swap from the WIDER sentence to the
    // NARROWER one while still erasing the refusal: worse than not arbitrating at all.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: true,
        explained: { axis: "settling" },
        current: BOTH,
      }),
    ).toBe(true);
  });

  it("speaks when the OTHER axis was explained — a lock refusal says nothing about a settle", () => {
    // The reverse direction of the rank, and the reason it is a rank and not a mute: settling is the
    // wider, longer-lived state (`inertReason`), so a lock explanation cannot cover it.
    expect(
      freezeBannerSuppressed({
        axis: "settling",
        entering: true,
        explained: { axis: "locked", self: false },
        current: BOTH,
      }),
    ).toBe(false);
  });

  it("speaks when nothing was explained — the diner who did nothing still gets told", () => {
    // W9b's whole reason for existing: a peer takes the lock while this diner browses, every Add
    // goes inert, and without the banner the surface changes under them silently.
    for (const axis of AXES) {
      expect(
        freezeBannerSuppressed({ axis, entering: true, explained: null, current: FROZEN(axis) }),
      ).toBe(false);
    }
  });

  it("speaks when the lock CHANGED HANDS under a latched explanation", () => {
    // ⚠️ CODEX ROUND 2 ON #256, P2 — and the sentence is why. `refusedWriteClause` renders a frozen
    // refusal through `inertReason({ lockedByYou: refusal.freeze === "self" })`, so the region holds
    // either "the order’s locked while you check out" or "…while someone checks out". `locked`
    // never goes false across a handoff, so no release edge retires the latch; an axis-only rule
    // then suppressed the banner for the OTHER owner and left the diner reading that THEY are
    // checking out while the lockbar named someone else.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: true,
        explained: { axis: "locked", self: true },
        current: { locked: true, settling: false, lockedByYou: false },
      }),
    ).toBe(false);
    // The reverse handoff misreports identically, so it is pinned identically.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: true,
        explained: { axis: "locked", self: false },
        current: { locked: true, settling: false, lockedByYou: true },
      }),
    ).toBe(false);
    // ...and the explanation that still names the right holder keeps its silence, so the fix is not
    // just "never suppress a lock banner".
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: true,
        explained: { axis: "locked", self: true },
        current: { locked: true, settling: false, lockedByYou: true },
      }),
    ).toBe(true);
  });

  it("does not read ownership on the SETTLING axis — the split sentence names no holder", () => {
    // The separating case for scoping the ownership test to the lock arm: "Your table is splitting
    // the bill" attributes nothing, so a lock changing hands beside it must not un-silence it.
    for (const lockedByYou of [true, false]) {
      expect(
        freezeBannerSuppressed({
          axis: "settling",
          entering: true,
          explained: { axis: "settling" },
          current: { locked: true, settling: true, lockedByYou },
        }),
      ).toBe(true);
    }
  });
});

describe("explainedByRefusal — only a cause that NAMES a freeze silences its banner", () => {
  it("maps each freeze cause to its own axis, carrying the lock's attribution", () => {
    expect(explainedByRefusal(PEER_LOCK)).toEqual({ axis: "locked", self: false });
    expect(explainedByRefusal(SELF_LOCK)).toEqual({ axis: "locked", self: true });
    expect(explainedByRefusal(SPLIT)).toEqual({ axis: "settling" });
  });

  it("reads attribution from the SAME field the sentence forks on", () => {
    // ⚠️ `refusedWriteClause` selects its clause with `refusal.freeze === "self"`. Deriving `self`
    // from anything else would be the second computation of one fact — the drift shape W17 named,
    // and the reason `viewerHoldsLock` was taken off `refusedWriteClause` in the first place. An
    // unattributable lock (`held`: a thin read that knows neither holder nor own seat) says
    // "someone", exactly like a peer's, so it latches the same way.
    const held = refusal({ locked: true, lockedBy: null });
    expect(held.cause === "frozen" && held.freeze).toBe("held");
    expect(explainedByRefusal(held)).toEqual({ axis: "locked", self: false });
  });

  it("`unknown` explains NOTHING — its sentence names no freeze", () => {
    // ⚠️ The separating case for the whole module. `unknown`'s clause is "the order below is up to
    // date"; it asserts no freeze, so it must not silence a banner about one. Deriving the axis from
    // the cart's flags instead of the REFUSAL would get this wrong, because an `unknown` refusal can
    // be followed a tick later by a genuine freeze the diner has not been told about.
    const editable = refusal({ locked: false, lockedBy: null });
    expect(editable.cause).toBe("unknown");
    expect(explainedByRefusal(editable)).toBeNull();
    for (const axis of AXES) {
      expect(
        freezeBannerSuppressed({
          axis,
          entering: true,
          explained: explainedByRefusal(editable),
          current: FROZEN(axis),
        }),
      ).toBe(false);
    }
  });
});

describe("explanationHolds — a latch is a claim about what is ON SCREEN", () => {
  it("keeps the explanation only while that freeze is still true", () => {
    expect(
      explanationHolds(
        { axis: "locked", self: false },
        { ...FROZEN("locked"), lockedByYou: false },
      ),
    ).toEqual({ axis: "locked", self: false });
    expect(explanationHolds({ axis: "settling" }, FROZEN("settling"))).toEqual({
      axis: "settling",
    });
  });

  it("drops an explanation the rendered cart does not carry — the overtaken-read hole", () => {
    // ⚠️ THE WHOLE REASON THIS EXISTS (blind pass CRITICAL, then Codex P1 on the first fix). A
    // recovery read can classify `frozen` from a view that LOST the screen, and a `viewIsCurrent`
    // snapshot taken when that read landed does not survive another mutation applying afterwards.
    // Latching then claims a freeze nobody can see: no release edge can fire for it, and the next
    // genuine lock is suppressed — a read-only cart, announced to nobody.
    expect(explanationHolds({ axis: "locked", self: false }, EDITABLE)).toBeNull();
    expect(explanationHolds({ axis: "settling" }, EDITABLE)).toBeNull();
  });

  it("reads the axis it was given, not merely whether ANY freeze is on screen", () => {
    // The separating case: a cart that is settling does not keep a LOCK explanation alive, and
    // vice-versa. A check that asked "is anything frozen?" would pass both of these wrongly.
    expect(explanationHolds({ axis: "locked", self: false }, FROZEN("settling"))).toBeNull();
    expect(explanationHolds({ axis: "settling" }, FROZEN("locked"))).toBeNull();
  });

  it("drops a lock explanation whose HOLDER no longer matches the screen", () => {
    // Codex round 2, P2 — at the source rather than at the banner. `locked` stays true across a
    // handoff, so the boolean alone cannot retire an explanation the sentence has outlived.
    expect(
      explanationHolds(
        { axis: "locked", self: true },
        { locked: true, settling: false, lockedByYou: false },
      ),
    ).toBeNull();
    expect(
      explanationHolds(
        { axis: "locked", self: false },
        { locked: true, settling: false, lockedByYou: true },
      ),
    ).toBeNull();
  });

  it("passes null through — a refusal that explained no freeze latches nothing", () => {
    expect(explanationHolds(null, { locked: true, settling: true, lockedByYou: true })).toBeNull();
  });
});
