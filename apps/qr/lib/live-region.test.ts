import { describe, expect, it } from "vitest";
import {
  explainedByRefusal,
  explanationHolds,
  freezeBannerSuppressed,
  type FreezeAxis,
} from "./live-region";
import { classifyRefusedWrite } from "./cart-freeze";

const AXES: FreezeAxis[] = ["locked", "settling"];
/** The cart frozen on exactly one axis. */
const FROZEN = (axis: FreezeAxis) => ({ locked: axis === "locked", settling: axis === "settling" });
/** Both freezes live at once — reachable, since `locked_at` and `settle_at` are independent. */
const BOTH = { locked: true, settling: true };

const EDITABLE = { locked: false, settling: false };

describe("freezeBannerSuppressed — a release that restores editing is never silenced", () => {
  it("speaks on EVERY release into an EDITABLE cart, whatever was explained", () => {
    // ⚠️ RULE 1, AND THE ONLY RULE HERE WHOSE FAILURE COSTS A DINER THEIR ORDER — every other one
    // can be wrong in the direction of one redundant sentence. Tested across the whole `explained`
    // domain rather than at one value for that reason: a diner never told the cart reopened keeps
    // believing it is frozen, and nothing else on /menu corrects them.
    for (const axis of AXES) {
      for (const explained of [null, "locked", "settling"] as const) {
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
        current: { locked: false, settling: true },
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
        explained: "settling",
        current: { locked: false, settling: true },
      }),
    ).toBe(true);
  });

  it("speaks when the explanation names an axis that is no longer frozen", () => {
    // The separating case for reusing `explanationHolds` here: a stale explanation must not buy
    // silence. Lock released, settle never active, and a "locked" explanation no longer holds.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: false,
        explained: "locked",
        current: EDITABLE,
      }),
    ).toBe(false);
  });
});

describe("freezeBannerSuppressed — entering a freeze", () => {
  it("is silent ONLY when the same axis was explained", () => {
    for (const axis of AXES) {
      expect(
        freezeBannerSuppressed({ axis, entering: true, explained: axis, current: FROZEN(axis) }),
      ).toBe(true);
    }
  });

  it("is silent for the NARROWER axis when the WIDER one was explained", () => {
    // ⚠️ PRECEDENCE, and the cell an equality rule got wrong (blind pass, HIGH). Both freezes can
    // enter on ONE applied view — `locked_at` and `settle_at` are independent columns — and
    // `classifyRefusedWrite` tests settling FIRST, so the refusal there explains `settling`. Under
    // equality the LOCK banner was let through, and because its effect is declared first its
    // callback runs first and it ends up as the surviving sentence: the region swaps from the WIDER
    // banner to the NARROWER one while the refusal is still erased. Worse than doing nothing.
    expect(
      freezeBannerSuppressed({
        axis: "locked",
        entering: true,
        explained: "settling",
        current: BOTH,
      }),
    ).toBe(true);
  });

  it("speaks when the OTHER axis was explained — a lock refusal says nothing about a settle", () => {
    // ⚠️ THE SEPARATING CASE for rule 3, and the reason `explained` is an axis and not a boolean.
    // `inertReason` fixes settling as the widest, longest-lived state; silencing its banner because
    // a LOCK was explained drops the more consequential of the two freezes.
    // ⚠️ ASYMMETRIC ON PURPOSE — the reverse direction is the test above. A lock refusal has NOT
    // told the diner about the settle freeze, and `inertReason` fixes settling as the wider state,
    // so the wider banner must still speak. Ranking these the other way would silence the more
    // consequential of the two.
    expect(
      freezeBannerSuppressed({
        axis: "settling",
        entering: true,
        explained: "locked",
        current: BOTH,
      }),
    ).toBe(false);
  });

  it("speaks when nothing was explained — the diner who did nothing still gets told", () => {
    // This is the case the banner EXISTS for (W9b): a peer takes the lock while the diner browses
    // and every Add goes inert. Suppressing here would delete the feature rather than arbitrate it.
    for (const axis of AXES) {
      expect(
        freezeBannerSuppressed({ axis, entering: true, explained: null, current: FROZEN(axis) }),
      ).toBe(false);
    }
  });
});

describe("explainedByRefusal — only a cause that NAMES a freeze silences its banner", () => {
  it("maps each freeze cause to its own axis", () => {
    expect(explainedByRefusal("frozen")).toBe("locked");
    expect(explainedByRefusal("settling")).toBe("settling");
  });

  it("`unknown` explains NOTHING — its sentence names no freeze", () => {
    // ⚠️ The separating case for the whole module. `unknown`'s clause is "the order below is up to
    // date"; it asserts no freeze, so it must not silence a banner about one. Deriving the axis from
    // the cart's flags instead of the CAUSE would get this wrong, because an `unknown` refusal can
    // be followed a tick later by a genuine freeze the diner has not been told about.
    expect(explainedByRefusal("unknown")).toBeNull();
    for (const axis of AXES) {
      expect(
        freezeBannerSuppressed({
          axis,
          entering: true,
          explained: explainedByRefusal("unknown"),
          current: FROZEN(axis),
        }),
      ).toBe(false);
    }
  });

  it("is wired to the REAL classifier, not to a transcribed cause string", () => {
    // Derived by calling `classifyRefusedWrite`, so a renamed or retired cause fails here rather
    // than leaving this module mapping a string nothing produces (the #252 lesson: a fixture
    // asserting a value no producer emits proves nothing).
    const frozen = classifyRefusedWrite({
      ok: true,
      freeze: { locked: true, lockedBy: "seat-peer", mySeat: "seat-me" },
      settling: false,
    });
    const settling = classifyRefusedWrite({
      ok: true,
      freeze: { locked: false, lockedBy: null, mySeat: "seat-me" },
      settling: true,
    });
    const editable = classifyRefusedWrite({
      ok: true,
      freeze: { locked: false, lockedBy: null, mySeat: "seat-me" },
      settling: false,
    });
    expect(explainedByRefusal(frozen.cause)).toBe("locked");
    expect(explainedByRefusal(settling.cause)).toBe("settling");
    expect(explainedByRefusal(editable.cause)).toBeNull();
  });
});

describe("explanationHolds — a latch is a claim about what is ON SCREEN", () => {
  it("keeps the axis only while that freeze is still true", () => {
    expect(explanationHolds("locked", { locked: true, settling: false })).toBe("locked");
    expect(explanationHolds("settling", { locked: false, settling: true })).toBe("settling");
  });

  it("drops an axis the rendered cart does not carry — the overtaken-read hole", () => {
    // ⚠️ THE WHOLE REASON THIS EXISTS (blind pass CRITICAL, then Codex P1 on the first fix). A
    // recovery read can classify `frozen` from a view that LOST the screen, and a `viewIsCurrent`
    // snapshot taken when that read landed does not survive another mutation applying afterwards.
    // Latching then claims a freeze nobody can see: no release edge can fire for it, and the next
    // genuine lock is suppressed — a read-only cart, announced to nobody.
    expect(explanationHolds("locked", { locked: false, settling: false })).toBeNull();
    expect(explanationHolds("settling", { locked: false, settling: false })).toBeNull();
  });

  it("reads the axis it was given, not merely whether ANY freeze is on screen", () => {
    // The separating case: a cart that is settling does not keep a LOCK explanation alive, and
    // vice-versa. A check that asked "is anything frozen?" would pass both of these wrongly.
    expect(explanationHolds("locked", { locked: false, settling: true })).toBeNull();
    expect(explanationHolds("settling", { locked: true, settling: false })).toBeNull();
  });

  it("passes null through — a refusal that explained no freeze latches nothing", () => {
    expect(explanationHolds(null, { locked: true, settling: true })).toBeNull();
  });
});
