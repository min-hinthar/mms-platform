import { describe, expect, it } from "vitest";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import { inFlightHolder, inFlightRefusal } from "./inflight-refusal";

/**
 * Phase 2c · register (P2w) — the staff settle's "payment in flight" refusal must be TRUE about who
 * holds the money. "Someone’s already paying on their phone" was the only sentence, and after an
 * unknown-outcome card-on-file close the freeze is held by the REGISTER's own attempt (by design) —
 * so the "try again" `settle.card.unknown` invites was refused with a sentence about a guest's phone.
 */
const NOW = Date.parse("2026-09-25T18:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const base = {
  reason: "mid_payment" as const,
  locked: false,
  lockedAt: null as string | null,
  settleAt: null as string | null,
  settleByIsSeat: null as boolean | null,
  nowMs: NOW,
};

describe("inFlightHolder — who holds the money, as far as the cart row and one read can tell", () => {
  it("a fresh pay-lock is a guest's phone (the single-pay door is the diner's)", () => {
    expect(inFlightHolder({ ...base, locked: true, lockedAt: ago(1000) })).toBe("phone");
  });

  it("a fresh settlement freeze owned by a SEAT of the session is a guest's phone (the split)", () => {
    expect(inFlightHolder({ ...base, settleAt: ago(1000), settleByIsSeat: true })).toBe("phone");
  });

  it("a fresh freeze owned by NO seat is the register's own attempt — never 'their phone'", () => {
    // MUTATION: read the owner as a seat whatever it is — the register's held freeze is blamed on a
    // guest's phone again (P2w); red.
    expect(inFlightHolder({ ...base, settleAt: ago(1000), settleByIsSeat: false })).toBe(
      "register",
    );
  });

  it("an unreadable owner is UNSURE — never a guess in either direction", () => {
    expect(inFlightHolder({ ...base, settleAt: ago(1000), settleByIsSeat: null })).toBe("unsure");
  });

  it("an authorized split share on a stale freeze is guests paying on their phones", () => {
    expect(
      inFlightHolder({ ...base, reason: "split_in_progress", settleAt: ago(SETTLE_TTL_MS + 1) }),
    ).toBe("phone");
  });

  it("the lifetimes are the freeze's own (lib/lock-ttl): an aged lock or freeze says nothing about who holds it", () => {
    // Both edges, by the constants — never a transcribed number.
    expect(inFlightHolder({ ...base, locked: true, lockedAt: ago(CART_LOCK_TTL_MS - 1) })).toBe(
      "phone",
    );
    expect(inFlightHolder({ ...base, locked: true, lockedAt: ago(CART_LOCK_TTL_MS) })).toBe(
      "unsure",
    );
    expect(
      inFlightHolder({ ...base, settleAt: ago(SETTLE_TTL_MS - 1), settleByIsSeat: false }),
    ).toBe("register");
    expect(inFlightHolder({ ...base, settleAt: ago(SETTLE_TTL_MS), settleByIsSeat: false })).toBe(
      "unsure",
    );
  });
});

describe("inFlightRefusal — one true sentence per holder", () => {
  it("the phone keeps its sentence verbatim", () => {
    expect(inFlightRefusal("phone")).toBe(
      "Someone’s already paying on their phone — wait for that to finish.",
    );
  });
  it("the register's own attempt says so, says not to take another tender, and names the real wait", () => {
    const s = inFlightRefusal("register");
    expect(s).not.toMatch(/phone/);
    expect(s).toMatch(/register/);
    expect(s).toMatch(/don’t take cash or another card/);
    // The wait is the freeze's lifetime, derived — never a number typed here.
    expect(s).toContain(`${Math.round(SETTLE_TTL_MS / 60_000)} minutes`);
  });
  it("unsure names both places and promises neither", () => {
    const s = inFlightRefusal("unsure");
    expect(s).toMatch(/phone/);
    expect(s).toMatch(/register/);
  });
});
