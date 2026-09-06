import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P3 — the rate wrappers, which had no suite at all until the register's promo apply needed one.
 *
 * Three things are asserted and they are all invisible to `tsc`, because every wrapper has the same
 * signature and the same return type:
 *
 *   1. **The BUCKET is unique per wrapper.** `mms_rate_limit` counts within `(bucket, key)`, so two
 *      wrappers sharing a bucket silently share one budget. `withinStaffPromoRate` is the newest and
 *      the most tempting to fold into `mutate` "since it is a staff write" — which would let a
 *      diner's own cart edits spend the register's promo budget and vice versa.
 *   2. **The KEY passes through verbatim.** The caller decides what the unit is (a seat, a uid, the
 *      calling staff row) and every one of these is a DIFFERENT unit; a wrapper that hashed, prefixed
 *      or dropped it would bound the wrong thing while every caller still compiled.
 *   3. **The check FAILS OPEN.** A limiter glitch must never strand a legit diner mid-order — the
 *      module says so in prose and nothing has ever proved it. This is the assertion that turns that
 *      sentence into a fact, and it is deliberately paired with the negative case so "always true"
 *      cannot pass for it.
 */

vi.mock("server-only", () => ({}));

type Call = { p_bucket: string; p_key: string; p_max: number; p_window_seconds: number };
let calls: Call[] = [];
let answer: { data: unknown; error: { message: string } | null } = { data: true, error: null };

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Call) => {
      expect(fn).toBe("mms_rate_limit");
      calls.push(args);
      return Promise.resolve(answer);
    },
  }),
}));

const {
  withinJoinRate,
  withinPeekRate,
  withinMutationRate,
  withinStepUpRate,
  withinReceiptRate,
  withinStaffPromoRate,
  assertMutationRate,
} = await import("./rate");
const { JOIN_RATE, PEEK_RATE, MUTATE_RATE, STEPUP_RATE, RECEIPT_RATE, STAFF_PROMO_RATE } =
  await import("./limits");

/** Every wrapper, with the limit object it is supposed to be spending. */
const WRAPPERS = [
  ["join", withinJoinRate, JOIN_RATE],
  ["peek", withinPeekRate, PEEK_RATE],
  ["mutate", withinMutationRate, MUTATE_RATE],
  ["stepup", withinStepUpRate, STEPUP_RATE],
  ["receipt", withinReceiptRate, RECEIPT_RATE],
  ["staffpromo", withinStaffPromoRate, STAFF_PROMO_RATE],
] as const;

beforeEach(() => {
  calls = [];
  answer = { data: true, error: null };
});

describe("the rate wrappers", () => {
  it("each spends its OWN bucket, with its OWN limits, on the key it was given", async () => {
    for (const [bucket, fn, limit] of WRAPPERS) {
      calls = [];
      await fn(`key-for-${bucket}`);
      expect(calls).toEqual([
        {
          p_bucket: bucket,
          p_key: `key-for-${bucket}`,
          p_max: limit.max,
          p_window_seconds: limit.windowSeconds,
        },
      ]);
    }
  });

  it("no two wrappers share a bucket — a shared bucket is a shared budget", async () => {
    // Derived, never transcribed: the buckets come out of the calls the wrappers actually made.
    for (const [, fn] of WRAPPERS) await fn("k");
    const buckets = calls.map((c) => c.p_bucket);
    expect(new Set(buckets).size).toBe(WRAPPERS.length);
  });

  it("answers false only on an explicit false — the SQL's own verdict, not a truthiness guess", async () => {
    answer = { data: false, error: null };
    expect(await withinStaffPromoRate("st-1")).toBe(false);
  });

  it("FAILS OPEN on a limiter error — a glitch must never strand a paying table", async () => {
    // Paired with the case above on purpose: a wrapper hard-wired to `true` would pass this one and
    // fail that one, which is what makes this an assertion rather than a tautology.
    answer = { data: null, error: { message: "rpc exploded" } };
    expect(await withinStaffPromoRate("st-1")).toBe(true);
    expect(await withinMutationRate("seat-1")).toBe(true);
  });

  it("assertMutationRate THROWS when the window is spent, and is silent when it is not", async () => {
    answer = { data: false, error: null };
    await expect(assertMutationRate("seat-1")).rejects.toThrow();
    answer = { data: true, error: null };
    await expect(assertMutationRate("seat-1")).resolves.toBeUndefined();
  });
});
