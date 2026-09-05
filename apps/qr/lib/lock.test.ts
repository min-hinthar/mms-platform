import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6c — the attempt-scoped release predicate, asserted as a QUERY SHAPE (terminal.test.ts mocks
 * this module, so nothing else pins the statement itself). The `.eq(settle_by, attemptId)` term is
 * the whole point of `releaseSettlementFor`: without it, a late webhook delivery / stale panel /
 * double-tap loser releases whatever freeze the cart holds NOW — the successor-era confusion the
 * W6c review confirmed HIGH.
 */

vi.mock("server-only", () => ({}));

type Q = { table: string; payload: Record<string, unknown>; eq: [string, unknown][] };
let queries: Q[] = [];
function chain(q: Q) {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    // M153 — the plain (non-count) chain carries `updateError` too. It used to hardcode `{ error:
    // null }`, so a test asserting "this helper surfaces its write error" could only ever assert
    // null: a decorative assertion, satisfied by a helper that swallowed everything. Every existing
    // test runs with `updateError = null`, so their expectations are unchanged.
    then(res: (v: { error: { message: string } | null }) => unknown) {
      return Promise.resolve({ error: updateError }).then(res);
    },
  };
  return api;
}
/** M119 (b) — the acquire path also does a diagnostic SELECT, so the mock grew a read half. The
 *  update half is untouched, so the W6c assertions above still measure what they always did. */
let updateCount: number | null = 0;
let updateError: { message: string } | null = null;
let statusRow: { status: string } | null = null;
let statusError: { message: string } | null = null;

/** M70 — the RPC half. `releasePromoGrantFor` calls `mms_release_promo_grant`, so the era it passes
 *  (and whether it calls at all) is the assertable surface. */
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcError: { message: string } | null = null;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ error: rpcError });
    },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>, opts?: { count?: string }) => {
        const q: Q = { table, payload, eq: [] };
        queries.push(q);
        return opts?.count ? countChain(q) : chain(q);
      },
      select: () => {
        const api: Record<string, unknown> = {
          eq: () => api,
          maybeSingle: () => Promise.resolve({ data: statusRow, error: statusError }),
        };
        return api;
      },
    }),
  }),
}));

/** M124 — the count-chain now RECORDS its `.eq` terms. `releasePayAttempt` uses `{count:"exact"}`
 *  (the PostgREST-14 representation trap), so without this its predicate — the whole defence — was
 *  invisible to every assertion: a test could only see that some update ran. */
function countChain(q?: Q) {
  const api: Record<string, unknown> = {
    eq: (col: string, val: unknown) => {
      q?.eq.push([col, val]);
      return api;
    },
    or: () => api,
    then: (r: (v: { count: number | null; error: unknown }) => unknown) =>
      Promise.resolve({ count: updateCount, error: updateError }).then(r),
  };
  return api;
}

const {
  releaseSettlementFor,
  releaseSettlement,
  releasePromoGrantFor,
  acquireCartLock,
  releasePayAttempt,
  releaseCartLockFor,
  releaseCartLock,
  linkPaymentIntent,
  unlinkPaymentIntent,
  releaseByIntent,
} = await import("./lock");

beforeEach(() => {
  queries = [];
  rpcCalls = [];
  rpcError = null;
  updateCount = 0;
  updateError = null;
  statusRow = { status: "open" };
  statusError = null;
});

describe("releaseSettlementFor — the era guard lives IN the statement", () => {
  it("nulls the freeze ONLY where this attempt still owns it", async () => {
    const err = await releaseSettlementFor("cart-1", "attempt-1");
    expect(err).toBeNull();
    const q = queries[0]!;
    expect(q.table).toBe("qr_carts");
    expect(q.payload).toEqual({ settle_at: null, settle_by: null });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    // Without this predicate a release that outlived its attempt nulls a SUCCESSOR's live freeze.
    expect(q.eq).toContainEqual(["settle_by", "attempt-1"]);
  });

  it("the unscoped release stays unscoped (the online paths' documented, TTL-backstopped shape)", async () => {
    await releaseSettlement("cart-1");
    const q = queries[0]!;
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq.some(([col]) => col === "settle_by")).toBe(false);
  });
});

/**
 * M119 (b) — the diagnostic read that exists to "message it honestly" was the one dropping its error.
 *
 * This is the SAME defect the acquire path's own comment already describes and fixes one statement
 * up: "The old code destructured only `data`, ignored that error, saw 0 rows, and returned
 * 'held_by_other'" — which gave EVERY checkout a spurious 409 after the PostgREST 14 upgrade. That
 * fix landed on the UPDATE; the identical shape survived three lines below.
 *
 * Unbound, a failed status read makes `cart` null, `cart?.status === "open"` false, and the verdict
 * `closed` — so `create-intent` answers "This order is no longer open." to a diner whose order is
 * open, and they cannot pay.
 */
describe("acquireCartLock — an unreadable status is not a closed order", () => {
  it("THE DEFECT — a failed status read must not report the order closed", async () => {
    updateCount = 0; // the conditional UPDATE matched nothing, so the diagnostic read runs
    statusRow = null;
    statusError = { message: "transport failure" };
    const res = await acquireCartLock("cart-1", "u1");
    expect(res.result).not.toBe("closed");
    expect(res.result).toBe("unavailable");
    // M70 — a non-acquired outcome names no attempt; there is no era to hand a later release.
    expect(res.era).toBeNull();
  });

  it("a genuinely closed cart still reports closed — the honest case is untouched", async () => {
    updateCount = 0;
    statusRow = { status: "paid" };
    statusError = null;
    await expect(acquireCartLock("cart-1", "u1")).resolves.toEqual({ result: "closed", era: null });
  });

  it("a fresh lock held by another member still reports held_by_other", async () => {
    updateCount = 0;
    statusRow = { status: "open" };
    await expect(acquireCartLock("cart-1", "u1")).resolves.toEqual({
      result: "held_by_other",
      era: null,
    });
  });

  it("the ordinary acquire is unaffected", async () => {
    updateCount = 1;
    const ok = await acquireCartLock("cart-1", "u1");
    expect(ok.result).toBe("acquired");
    // M70 — the era is the value THIS acquisition wrote, and every later "am I still the attempt
    // that owns this cart?" question reads it. An acquire that answers with no era would leave
    // create-intent unable to scope its own grant release.
    expect(ok.era).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(ok.era as string))).toBe(false);
    // …and it is the SAME value the UPDATE wrote. A second `new Date()` inside the function would
    // be a different millisecond, so the returned era would name an attempt the row does not hold.
    const written = queries.find((q) => "locked_at" in q.payload)?.payload.locked_at;
    expect(written).toBe(ok.era);
  });
});

/**
 * M70 · Codex P1 on #233 — a promo pin is a statement about ONE attempt's basket, and
 * `mms_pin_promo_grant` no-ops while the pin is non-null. So an attempt that inherits a previous
 * pin prices its basket with a grant that basket never earned: drop a $30 basket to $20, re-check
 * out, and the old grant is charged for real.
 *
 * WHO releases it is the design, and Codex round 2 on #240 moved it. The decline webhook looked
 * like the place — it is the exit that leaves an editable cart carrying an authorized discount —
 * and it is wrong: an inline decline re-confirms the SAME PaymentIntent at the amount the pin
 * authorized, so clearing it there turns a working retry into a charge fulfillment cannot
 * re-derive. The release belongs to the NEXT attempt, which holds the lock it releases under.
 *
 * Asserted here rather than in the route because `app/api/**` is outside MONEY_PATHS and outside
 * `verify:slice`'s mutant set — a money rule written there cannot be guarded (CLAUDE.md, W17).
 */
describe("releasePromoGrantFor — the next attempt clears the previous pin, era-scoped", () => {
  it("clears the pin through the era-scoped RPC", async () => {
    const err = await releasePromoGrantFor("cart-1", "2026-08-29T00:00:00.000Z");
    expect(err).toBeNull();
    expect(rpcCalls).toEqual([
      {
        fn: "mms_release_promo_grant",
        args: { p_cart_id: "cart-1", p_attempt: "2026-08-29T00:00:00.000Z" },
      },
    ]);
  });

  it("passes the ERA, never a cart-wide clear — a successor's pin must survive", async () => {
    await releasePromoGrantFor("cart-1", "era-A");
    // The era is the whole predicate: the RPC matches `locked_at is not distinct from p_attempt`,
    // so a caller holding era-A finds zero rows once era-B holds the cart. An empty or absent
    // attempt would match every era and wipe the live pin.
    expect(rpcCalls[0]?.args.p_attempt).toBe("era-A");
    expect(rpcCalls[0]?.args.p_attempt).not.toBe("");
  });

  it("does NOT clear anything when the caller cannot name its era", async () => {
    const err = await releasePromoGrantFor("cart-1", "");
    expect(err).toBeNull();
    // A caller that cannot name the era it acquired has nothing proving the cart is its own; a
    // cart-wide clear is the successor-wiping hazard the scoping exists to prevent.
    expect(rpcCalls).toEqual([]);
  });

  it("surfaces the write error instead of swallowing it", async () => {
    rpcError = { message: "boom" };
    expect(await releasePromoGrantFor("cart-1", "era-A")).toEqual({ message: "boom" });
  });
});

describe("releasePayAttempt — M124: one statement, and it names the ATTEMPT", () => {
  it("releases lock AND pin together, scoped to this seat and this era", async () => {
    updateCount = 1;
    const { released, error } = await releasePayAttempt(
      "cart-1",
      "uid-1",
      "2026-09-01T10:00:00.000Z",
    );
    expect(error).toBeNull();
    expect(released).toBe(true);
    const q = queries[0]!;
    expect(q.table).toBe("qr_carts");
    // THE PIN IS IN THE SAME PAYLOAD AS THE LOCK. Two statements are two chances to half-apply, and
    // the half that lands leaves `locked = false` over a live pin — the state cash/Terminal/split
    // charge (M123 a′).
    expect(q.payload).toEqual({
      promo_granted_cents: null,
      // M151 — the link goes in the SAME payload: "pin cleared, link still set" must be unreachable.
      live_payment_intent_id: null,
      locked: false,
      locked_at: null,
      locked_by: null,
    });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq).toContainEqual(["locked_by", "uid-1"]);
    // Without this term the predicate is `_for_holder`'s again and an abandoned tab clears the live
    // tab's pin — the entire M124 defect.
    expect(q.eq).toContainEqual(["locked_at", "2026-09-01T10:00:00.000Z"]);
  });

  it("THE M124 CASE: a superseded tab matches zero rows and reports it, clearing nothing", async () => {
    // The row now carries era B; this caller echoes era A. PostgREST matches nothing.
    updateCount = 0;
    const { released, error } = await releasePayAttempt(
      "cart-1",
      "uid-1",
      "2026-09-01T09:00:00.000Z",
    );
    expect(error).toBeNull();
    // `released: false` is the honest answer "Edit order" renders — not a silent no-op.
    expect(released).toBe(false);
    expect(queries[0]!.eq).toContainEqual(["locked_at", "2026-09-01T09:00:00.000Z"]);
  });

  it("FAILS CLOSED with no era: issues NO statement at all", async () => {
    // An old client bundle mid-deploy, or a forged/unparseable token normalized to null. Releasing
    // on that basis is M124 with extra steps, so the only safe move is to do nothing and let the
    // lock TTL be the backstop.
    const { released, error } = await releasePayAttempt("cart-1", "uid-1", null);
    expect(released).toBe(false);
    expect(error).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it("surfaces the write error instead of swallowing it", async () => {
    updateError = { message: "boom" };
    updateCount = null;
    const { released, error } = await releasePayAttempt(
      "cart-1",
      "uid-1",
      "2026-09-01T10:00:00.000Z",
    );
    expect(error).toEqual({ message: "boom" });
    // A null count on an errored write must never read as a successful release.
    expect(released).toBe(false);
  });
});

/**
 * M153 — the LOCK release had the same uid-only hole the PIN release did, one statement later.
 *
 * `create-intent`'s refusal paths (a sold-out line, a filled pickup slot, a missing pickup contact)
 * exit ABOVE the promo pin and used `releaseCartLock(cartId, uid)`. `acquireCartLock` deliberately
 * lets the SAME diner re-acquire with a fresh era, so a losing overlapping attempt's refusal
 * released the WINNER's lock and dropped a cart back to editable underneath a mounted Payment
 * Element — the peer-mutation-during-checkout hole the lock exists to close, opened by its own
 * release.
 */
describe("releaseCartLockFor — M153: the refusal paths name their attempt", () => {
  it("scopes the release to this seat AND this era", async () => {
    const err = await releaseCartLockFor("cart-1", "uid-1", "2026-09-01T10:00:00.000Z");
    expect(err).toBeNull();
    const q = queries[0]!;
    expect(q.table).toBe("qr_carts");
    expect(q.payload).toEqual({ locked: false, locked_at: null, locked_by: null });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq).toContainEqual(["locked_by", "uid-1"]);
    // MUTATION: drop this term → the predicate is the old uid-only one and a losing attempt
    // unfreezes the winner's cart mid-checkout.
    expect(q.eq).toContainEqual(["locked_at", "2026-09-01T10:00:00.000Z"]);
  });

  it("LEAVES THE PIN ALONE — these callers exit above it, so any pin is a PREDECESSOR's", async () => {
    // The one thing that must NOT be copied from `releasePayAttempt`. PR #244 tried clearing the
    // pin on exactly these exits and reverted it: a predecessor's captured-but-unfulfilled
    // PaymentIntent still reconciles against that pin ("the pin has to outlive the lock", M70).
    // MUTATION: add `promo_granted_cents: null` to the payload → this fails, and the reverted
    // defect is back.
    await releaseCartLockFor("cart-1", "uid-1", "2026-09-01T10:00:00.000Z");
    expect(queries[0]!.payload).not.toHaveProperty("promo_granted_cents");
  });

  it("FAILS CLOSED with no era: issues NO statement at all", async () => {
    // Same rule as `releasePayAttempt`. A caller that cannot name its attempt cannot show the lock
    // is its own, and the TTL is the backstop.
    // MUTATION: drop the `if (!era)` guard → a statement IS issued with a null era term, and this
    // fails on `queries`. Not issuing it at all is the shape that needs no argument about how a
    // null compares in a filter.
    const err = await releaseCartLockFor("cart-1", "uid-1", null);
    expect(err).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it("surfaces the write error instead of swallowing it", async () => {
    // W10c's rule: best-effort at the call site is a DECISION, not an excuse to never know.
    // MUTATION: `return null` instead of `return error` → create-intent's refusal paths would log
    // nothing while every lock they meant to free stayed held for the full TTL.
    updateError = { message: "boom" };
    expect(await releaseCartLockFor("cart-1", "uid-1", "2026-09-01T10:00:00.000Z")).toEqual({
      message: "boom",
    });
  });

  it("the CART-WIDE release stays cart-wide — the webhook's decline path is untouched", async () => {
    // `releaseCartLock(cartId, null)` is the decline arm: the charge failed, so free the cart for
    // everyone. Era-scoping that would strand a table whose payer has gone.
    await releaseCartLock("cart-1", null);
    const q = queries[0]!;
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq.some(([col]) => col === "locked_by")).toBe(false);
    expect(q.eq.some(([col]) => col === "locked_at")).toBe(false);
  });
});

describe("M151 — the cart→intent link, as query SHAPES", () => {
  it("linkPaymentIntent names the intent under THIS seat and THIS era, and only onto a null or same link", async () => {
    updateCount = 1;
    const res = await linkPaymentIntent("cart-1", "uid-1", "2026-09-05T10:00:00.000Z", "pi_A");
    expect(res).toEqual({ linked: true, error: null });
    const q = queries[0]!;
    expect(q.table).toBe("qr_carts");
    expect(q.payload).toEqual({ live_payment_intent_id: "pi_A" });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq).toContainEqual(["locked_by", "uid-1"]);
    expect(q.eq).toContainEqual(["locked_at", "2026-09-05T10:00:00.000Z"]);
  });

  it("linkPaymentIntent reports the lock MOVED when zero rows match — the caller cancels its own mint", async () => {
    updateCount = 0;
    const res = await linkPaymentIntent("cart-1", "uid-1", "era-old", "pi_A");
    expect(res.linked).toBe(false);
    expect(res.error).toBeNull();
  });

  it("unlinkPaymentIntent is keyed on the INTENT, never on the era", async () => {
    // M124's discriminator: a late caller naming an intent the cart no longer holds matches nothing.
    await unlinkPaymentIntent("cart-1", "pi_A");
    const q = queries[0]!;
    expect(q.payload).toEqual({ live_payment_intent_id: null });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq).toContainEqual(["live_payment_intent_id", "pi_A"]);
    expect(q.eq.some(([col]) => col === "locked_at" || col === "locked_by")).toBe(false);
  });

  it("releaseByIntent drops lock, pin AND link in one statement keyed on the intent", async () => {
    updateCount = 1;
    const res = await releaseByIntent("cart-1", "pi_A");
    expect(res).toEqual({ released: true, error: null });
    const q = queries[0]!;
    expect(q.payload).toEqual({
      promo_granted_cents: null,
      live_payment_intent_id: null,
      locked: false,
      locked_at: null,
      locked_by: null,
    });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq).toContainEqual(["live_payment_intent_id", "pi_A"]);
    // A successor's row names a different intent and is untouched by construction.
    expect(q.eq.some(([col]) => col === "locked_at" || col === "locked_by")).toBe(false);
  });

  it("releaseByIntent is a normal zero-row no-op for a late delivery", async () => {
    updateCount = 0;
    expect(await releaseByIntent("cart-1", "pi_gone")).toEqual({ released: false, error: null });
  });
});
