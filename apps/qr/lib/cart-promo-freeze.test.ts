import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M70 (Codex round 2, P1) — `applyPromo`'s write must be atomic against the FREEZE, not just the
 * status.
 *
 * The `locked || settling` refusal at the top of `applyPromo` is read at authz time, and two awaited
 * RPCs (`mms_promo_attempt`, `mms_promo_check`) run between it and the UPDATE. That is long enough
 * for a tablemate to reach the pay screen, take the pay lock, and pin the promo grant. A write gated
 * only on `status = 'open'` sails straight through and clears a LIVE attempt's pin — its
 * PaymentIntent was minted under the old code, the webhook re-derives under the new one, the amounts
 * disagree, and `reconcile_mismatch` lands after the card is charged.
 *
 * This suite drives a fake PostgREST that actually EVALUATES the filters against a row, rather than
 * recording the calls. A mutant that deletes an `.or()` therefore changes the OUTCOME — the row moves
 * when it must not — instead of merely changing a call list, which is the difference between a guard
 * and a transcript.
 *
 * Both directions are pinned on purpose. Over-blocking is as expensive as under-blocking: a lock is
 * only real while `locked_at` is inside CART_LOCK_TTL (`authz.ts:168-175`), so a STALE lock must
 * still let a promo through, or an abandoned pay screen freezes the promo field for five minutes.
 */

vi.mock("server-only", () => ({}));

vi.mock("@mms/db/schemas", () => {
  const pass = { parse: (x: unknown) => x };
  return {
    addItemInput: pass,
    applyPromoInput: pass,
    applyRewardInput: pass,
    assignLineInput: pass,
    cartViewInput: pass,
    makeItNowInput: pass,
    sendToKitchenInput: pass,
    setKioskTipInput: pass,
    setLineFulfillmentInput: pass,
    setQtyInput: pass,
    undoFireInput: pass,
  };
});

vi.mock("./authz", () => ({
  assertCartItemMember: () => Promise.resolve({}),
  // Deliberately UNFROZEN: this suite is about the window AFTER this read, so the pre-check must
  // pass in every case or it would mask the very race under test.
  assertCartMember: () =>
    Promise.resolve({ uid: "u-1", sessionId: "s-1", locked: false, settling: false }),
  AuthzError: class AuthzError extends Error {},
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./order-lines", () => ({ priceItem: () => Promise.resolve({}) }));

// The REAL TTLs — importing them is what makes the freshness boundary in this suite the same one
// production uses. A copy here would drift the moment either constant moved. T20 moved them to
// `./lock-ttl` (a module without `server-only`, so a client can hold them); this mock stays because
// it exists for `releaseCartLock`, which is still lock.ts's.
vi.mock("./lock", async () => {
  const actual = await vi.importActual<typeof import("./lock")>("./lock");
  return { ...actual, releaseCartLock: () => Promise.resolve() };
});
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";

type Row = Record<string, unknown>;

/** The cart the fake DB holds. Each test rewrites it. */
let row: Row | null = null;
/** Forced failure for the follow-up diagnosis read only (the UPDATE has its own flag). */
let readFails = false;

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

/** Evaluate one PostgREST filter term, e.g. `locked_at.lte.2026-01-01T00:00:00.000Z`. */
function term(r: Row, expr: string): boolean {
  const first = expr.indexOf(".");
  const second = expr.indexOf(".", first + 1);
  const col = expr.slice(0, first);
  const op = expr.slice(first + 1, second);
  const raw = expr.slice(second + 1);
  const v = r[col];
  switch (op) {
    case "eq":
      return raw === "false" ? v === false : raw === "true" ? v === true : v === raw;
    case "is":
      return raw === "null" ? v === null || v === undefined : v === raw;
    case "lte":
      return v !== null && v !== undefined && String(v) <= raw;
    case "lt":
      return v !== null && v !== undefined && String(v) < raw;
    default:
      throw new Error(`fake db: unsupported operator "${op}" in "${expr}"`);
  }
}

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "is"; col: string; val: unknown }
  | { kind: "or"; expr: string };

const matches = (r: Row, filters: Filter[]) =>
  filters.every((f) =>
    f.kind === "eq"
      ? r[f.col] === f.val
      : f.kind === "is"
        ? f.val === null
          ? r[f.col] === null || r[f.col] === undefined
          : r[f.col] === f.val
        : f.expr.split(",").some((t) => term(r, t)),
  );

function builder(mode: "update" | "select", values: Row | null) {
  const filters: Filter[] = [];
  const api = {
    eq(col: string, val: unknown) {
      filters.push({ kind: "eq", col, val });
      return api;
    },
    or(expr: string) {
      filters.push({ kind: "or", expr });
      return api;
    },
    // M151 — `.is("live_payment_intent_id", null)` is the link gate; a fake that lacked it would
    // throw on the chain and read as a broken suite rather than a tested predicate.
    is(col: string, val: unknown) {
      filters.push({ kind: "is", col, val });
      return api;
    },
    maybeSingle() {
      if (readFails) return Promise.resolve({ data: null, error: { message: "read failed" } });
      const hit = row && matches(row, filters) ? row : null;
      return Promise.resolve({ data: hit, error: null });
    },
    // The UPDATE is awaited directly, so the builder itself has to be thenable.
    then(resolve: (r: { count: number; error: null }) => void) {
      const hit = row !== null && matches(row, filters);
      if (hit && values) Object.assign(row as Row, values);
      resolve({ count: hit ? 1 : 0, error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      update: (values: Row) => builder("update", values),
      select: () => builder("select", null),
    }),
    rpc: (fn: string) =>
      // Both pre-check RPCs succeed, so the only thing that can refuse the write is the freeze.
      Promise.resolve(
        fn === "mms_promo_attempt"
          ? { data: true, error: null }
          : { data: [{ valid: true, discount_cents: 1000, reason: null }], error: null },
      ),
  }),
}));

const { applyPromo } = await import("./cart");

const openCart = (over: Row = {}): Row => ({
  id: "c-1",
  status: "open",
  locked: false,
  locked_at: null,
  locked_by: null,
  settle_at: null,
  promo_code: null,
  // A LIVE attempt's pin. Whether this survives is the whole money question.
  promo_granted_cents: 1000,
  live_payment_intent_id: null,
  ...over,
});

beforeEach(() => {
  readFails = false;
  row = openCart();
});

describe("applyPromo — the write is atomic against the pay freeze", () => {
  it("applies on an open, unfrozen cart and voids the old grant", async () => {
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: true, discountCents: 1000 });
    expect(row?.promo_code).toBe("SAVE10");
    expect(row?.promo_granted_cents).toBeNull();
  });

  it("REFUSES while a tablemate holds a fresh pay lock, and leaves the live grant alone", async () => {
    row = openCart({ locked: true, locked_at: iso(30_000), locked_by: "u-2" });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: false, reason: "locked" });
    // The money assertion: a live attempt's pin is what the webhook reconciles the charge against.
    expect(row?.promo_granted_cents).toBe(1000);
    expect(row?.promo_code).toBeNull();
  });

  it("REFUSES while the table is settling, and leaves the live grant alone", async () => {
    row = openCart({ settle_at: iso(60_000) });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: false, reason: "locked" });
    expect(row?.promo_granted_cents).toBe(1000);
  });

  it("REFUSES while a LIVE intent names this cart — even past the lock TTL — and leaves the grant alone", async () => {
    // M152 (a). The lock expired five minutes ago; the intent it minted captured and its webhook is
    // late. Before this term the TTL-aware predicate let the code through and nulled the pin that
    // capture reconciles against: a charged card and no order. "locked" is the honest reason — a
    // payment for this order is still open.
    row = openCart({
      locked: false,
      locked_at: iso(CART_LOCK_TTL_MS + 60_000),
      live_payment_intent_id: "pi_captured_late",
    });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: false, reason: "locked" });
    expect(row?.promo_granted_cents).toBe(1000);
    expect(row?.promo_code).toBeNull();
  });

  it("still APPLIES when the link is null — the gate is the LINK, not the lock's history", async () => {
    row = openCart({
      locked: false,
      locked_at: iso(CART_LOCK_TTL_MS + 60_000),
      live_payment_intent_id: null,
    });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: true, discountCents: 1000 });
  });

  it("still APPLIES when the lock is stale — an abandoned pay screen must not freeze the promo", async () => {
    row = openCart({ locked: true, locked_at: iso(CART_LOCK_TTL_MS + 60_000), locked_by: "u-2" });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: true, discountCents: 1000 });
    expect(row?.promo_code).toBe("SAVE10");
  });

  it("still APPLIES when the settlement freeze is stale", async () => {
    row = openCart({ settle_at: iso(SETTLE_TTL_MS + 60_000) });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: true, discountCents: 1000 });
  });

  it("still APPLIES when `locked` is true but `locked_at` is null — that is not a lock", async () => {
    row = openCart({ locked: true, locked_at: null });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: true, discountCents: 1000 });
  });

  it("answers cart_closed when the cart is genuinely closed", async () => {
    row = openCart({ status: "paid" });
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: false, reason: "cart_closed" });
  });

  it("answers error — never a fabricated cart_closed — when the diagnosis read fails", async () => {
    row = openCart({ locked: true, locked_at: iso(30_000), locked_by: "u-2" });
    readFails = true;
    const res = await applyPromo("c-1", "save10");
    expect(res).toEqual({ ok: false, reason: "error" });
    expect(row?.promo_granted_cents).toBe(1000);
  });
});
