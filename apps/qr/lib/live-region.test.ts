import { describe, expect, it } from "vitest";
import { explainedByRefusal, freezeBannerSuppressed, type FreezeAxis } from "./live-region";
import { classifyRefusedWrite } from "./cart-freeze";

const AXES: FreezeAxis[] = ["locked", "settling"];

describe("freezeBannerSuppressed — the release is never silenced", () => {
  it("speaks on EVERY release, whatever was explained", () => {
    // Rule 1, and it is tested across the whole `explained` domain rather than one value: the
    // over-blocking direction is the expensive one here. A diner who is never told the cart
    // reopened keeps believing it is frozen, and nothing else on /menu tells them otherwise.
    for (const axis of AXES) {
      for (const explained of [null, "locked", "settling"] as const) {
        expect(freezeBannerSuppressed({ axis, entering: false, explained })).toBe(false);
      }
    }
  });
});

describe("freezeBannerSuppressed — entering a freeze", () => {
  it("is silent ONLY when the same axis was explained", () => {
    for (const axis of AXES) {
      expect(freezeBannerSuppressed({ axis, entering: true, explained: axis })).toBe(true);
    }
  });

  it("speaks when the OTHER axis was explained — a lock refusal says nothing about a settle", () => {
    // ⚠️ THE SEPARATING CASE for rule 3, and the reason `explained` is an axis and not a boolean.
    // `inertReason` fixes settling as the widest, longest-lived state; silencing its banner because
    // a LOCK was explained drops the more consequential of the two freezes.
    expect(freezeBannerSuppressed({ axis: "settling", entering: true, explained: "locked" })).toBe(
      false,
    );
    expect(freezeBannerSuppressed({ axis: "locked", entering: true, explained: "settling" })).toBe(
      false,
    );
  });

  it("speaks when nothing was explained — the diner who did nothing still gets told", () => {
    // This is the case the banner EXISTS for (W9b): a peer takes the lock while the diner browses
    // and every Add goes inert. Suppressing here would delete the feature rather than arbitrate it.
    for (const axis of AXES) {
      expect(freezeBannerSuppressed({ axis, entering: true, explained: null })).toBe(false);
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
        freezeBannerSuppressed({ axis, entering: true, explained: explainedByRefusal("unknown") }),
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
