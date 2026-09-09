import { describe, expect, it } from "vitest";
import { decideCarry, CARRY_OVERRIDE_LABEL } from "./merge-carry";
import type { MintOutcome } from "./merge";

/**
 * A7b — may we abandon this anonymous session?
 *
 * This is the guard on a PERMANENT loss, not a cosmetic one. Signing into a pre-existing account
 * switches uid; the anonymous uid holding this device's orders, Stars, coupons and favourites is then
 * unreachable forever (a replacement token needs the anon session, which is gone, and only
 * `service_role` can move the value afterwards). The old code minted best-effort and redirected
 * unconditionally, so every mint or stash failure destroyed that value silently — after the card had
 * already promised to move it.
 *
 * Two directions are tested with equal weight, because over-blocking is a failure too: a mint outage
 * must not lock out a diner who has nothing on this device to lose.
 */
const minted: MintOutcome = { kind: "minted", token: "tok-abc" };

describe("decideCarry", () => {
  it("proceeds when the token was minted AND reads back from storage", () => {
    expect(decideCarry(minted, "tok-abc")).toEqual({ kind: "proceed" });
  });

  it("BLOCKS a failed mint — the redirect would destroy the orders it promised to move", () => {
    const d = decideCarry({ kind: "failed" }, null);
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") throw new Error("unreachable: asserted blocked above");
    expect(d.reason).toBe("mint");
  });

  it("BLOCKS when the stash silently did not take", () => {
    // stashMergeToken swallows a storage failure by design (private mode, quota). A token that exists
    // only server-side is one MergeRedeemer will never find, which is indistinguishable in effect from
    // never minting one.
    const d = decideCarry(minted, null);
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") throw new Error("unreachable: asserted blocked above");
    expect(d.reason).toBe("stash");
  });

  it("BLOCKS when storage read back a DIFFERENT token than the one just minted", () => {
    // A stale token from an abandoned earlier attempt reads as present. Presence is not proof; identity
    // is. Without comparing the value, a `readMergeToken() != null` check would pass here and carry the
    // WRONG proof across the redirect.
    const d = decideCarry(minted, "tok-from-an-earlier-attempt");
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") throw new Error("unreachable: asserted blocked above");
    expect(d.reason).toBe("stash");
  });

  it("NEVER blocks a diner with nothing to carry, even with no token in storage", () => {
    // The over-blocking direction. `nothing-to-carry` is a CONFIRMED non-anonymous caller: abandoning
    // that session costs them nothing, so a mint outage must not stand between them and signing in.
    expect(decideCarry({ kind: "nothing-to-carry" }, null)).toEqual({ kind: "proceed" });
  });

  it("does not let a stray stored token rescue a FAILED mint", () => {
    // A leftover token from an earlier attempt is bound to a different moment and may already be spent.
    // Proceeding on it would look like a carry and move nothing.
    expect(decideCarry({ kind: "failed" }, "tok-abc").kind).toBe("blocked");
  });

  it("gives the two blocked reasons DIFFERENT messages, each naming its own cause", () => {
    const mintMsg = decideCarry({ kind: "failed" }, null);
    const stashMsg = decideCarry(minted, null);
    if (mintMsg.kind !== "blocked" || stashMsg.kind !== "blocked")
      throw new Error("unreachable: both asserted blocked above");
    expect(mintMsg.message).not.toBe(stashMsg.message);
    // The stash failure is the one a diner can act on themselves, so it names the likely cause.
    expect(stashMsg.message).toContain("private browsing");
  });

  it("offers a way through in every blocked message — a refusal is never a dead end", () => {
    for (const d of [decideCarry({ kind: "failed" }, null), decideCarry(minted, null)]) {
      if (d.kind !== "blocked") throw new Error("unreachable: asserted blocked above");
      expect(d.message).toContain("without them");
    }
  });
});

describe("CARRY_OVERRIDE_LABEL", () => {
  it("states the loss rather than shrugging it off", () => {
    // "they'll stay on this device" would be false: the session that owns them is abandoned by the very
    // sign-in this button performs, and nothing can reach it afterwards.
    expect(CARRY_OVERRIDE_LABEL).toContain("behind");
    expect(CARRY_OVERRIDE_LABEL).not.toMatch(/stay on this device|keep them here/i);
  });
});
