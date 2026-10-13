import { describe, expect, it } from "vitest";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS, effectiveFreeze, freezeRecheckDelayMs } from "./lock-ttl";

/**
 * T20 — the delay is the LONGEST held axis, and nothing here is transcribed.
 *
 * Every expectation compares against the exported constants rather than a literal, because the
 * values are policy: an owner who lengthens the settle window must not have to hunt a number out of
 * a test. What IS pinned is the rule over them.
 */
describe("freezeRecheckDelayMs", () => {
  it("answers null for an editable cart — there is nothing to wait for", () => {
    // A timer armed on an unfrozen cart is a poll, which is exactly what `recheckLock` declined to
    // build on the checkout side. Nothing to re-read means no schedule.
    expect(freezeRecheckDelayMs({ locked: false, settling: false })).toBeNull();
  });

  it("waits the lock's own TTL for a lock, and the settle's for a settle", () => {
    expect(freezeRecheckDelayMs({ locked: true, settling: false })).toBe(CART_LOCK_TTL_MS);
    expect(freezeRecheckDelayMs({ locked: false, settling: true })).toBe(SETTLE_TTL_MS);
  });

  it("takes the LONGEST axis when both are held, not the shortest", () => {
    // ⚠️ THE SEPARATING CASE. A cart that is both locked and settling stays frozen until BOTH have
    // lapsed, so re-reading at the shorter horizon finds it still frozen and costs a round trip for
    // nothing. Asserted as a comparison, so it holds whichever constant is larger.
    const both = freezeRecheckDelayMs({ locked: true, settling: true });
    expect(both).toBe(Math.max(CART_LOCK_TTL_MS, SETTLE_TTL_MS));
    expect(both).toBeGreaterThanOrEqual(freezeRecheckDelayMs({ locked: true, settling: false })!);
    expect(both).toBeGreaterThanOrEqual(freezeRecheckDelayMs({ locked: false, settling: true })!);
  });

  it("never answers 0 or a negative for a held freeze — that would busy-loop the scheduler", () => {
    for (const axes of [
      { locked: true, settling: false },
      { locked: false, settling: true },
      { locked: true, settling: true },
    ]) {
      expect(freezeRecheckDelayMs(axes)!).toBeGreaterThan(0);
    }
  });

  it("the two TTLs are ordered the way the model assumes: a settle outlives a lock", () => {
    // The `max` rule is only interesting because these differ. If a future edit made them equal the
    // rule would still be correct but this suite would stop separating max from min — so the
    // ordering is pinned here rather than assumed by the case above.
    expect(SETTLE_TTL_MS).toBeGreaterThan(CART_LOCK_TTL_MS);
  });
});

/**
 * #362 fix round (blind pass 5) — the freshness rule `assertCartMember` applies, named ONCE so
 * `setLineNote`'s re-read of the cart's freezes cannot drift from it.
 */
describe("effectiveFreeze — held AND fresh, on the caller's clock", () => {
  const now = Date.parse("2026-10-13T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("a lock counts while it is inside its TTL, and not once it has lapsed or been released", () => {
    // MUTATION (lcb/freeze/lock-never-lapses): drop the TTL comparison; red.
    expect(
      effectiveFreeze({ locked: true, locked_at: ago(CART_LOCK_TTL_MS - 1), settle_at: null }, now),
    ).toEqual({ locked: true, settling: false });
    expect(
      effectiveFreeze({ locked: true, locked_at: ago(CART_LOCK_TTL_MS + 1), settle_at: null }, now),
    ).toEqual({ locked: false, settling: false });
    // MUTATION (lcb/freeze/released-lock-holds): read `locked_at` without `locked`; red.
    expect(
      effectiveFreeze({ locked: false, locked_at: ago(1_000), settle_at: null }, now).locked,
    ).toBe(false);
    expect(effectiveFreeze({ locked: true, locked_at: null, settle_at: null }, now).locked).toBe(
      false,
    );
  });

  it("a settlement counts while inside ITS TTL — the longer one", () => {
    // MUTATION (lcb/freeze/settle-on-the-lock-ttl): judge a settlement by the LOCK's TTL; red.
    const between = CART_LOCK_TTL_MS + (SETTLE_TTL_MS - CART_LOCK_TTL_MS) / 2;
    expect(
      effectiveFreeze({ locked: false, locked_at: null, settle_at: ago(between) }, now),
    ).toEqual({ locked: false, settling: true });
    expect(
      effectiveFreeze({ locked: false, locked_at: null, settle_at: ago(SETTLE_TTL_MS + 1) }, now)
        .settling,
    ).toBe(false);
  });
});
