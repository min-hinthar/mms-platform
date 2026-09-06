import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P3 — the drill-down tells staff a discount is on the table, and tells them what it is WORTH.
 *
 * This is product truth on a money surface rather than a charge rule: `settleTotalCents` is derived
 * server-side either way, so losing these two fields never mis-charges anyone — it lets a cashier
 * take cash for a discounted table without knowing a discount applied, and it hides the code from
 * the one screen that can now remove it. Before P3, `floor.ts` carried NO mutants at all while
 * matching two money markers, so both fields would have been revertible with the gate green.
 *
 * The second assertion is the "name it ONCE" one and it is the sharper of the two: `settlePromoCents`
 * must come off the SAME `getCartTotals` result as `settleTotalCents`. Swapping it for
 * `discountCents` is the plausible refactor — the names are adjacent and both are "the discount" —
 * and it silently overstates the promo by the whole reward on any cart carrying one.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u", staffId: "st", role: "server", displayName: "S", email: null },
    }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));

/**
 * The totals engine, with promo and reward DELIBERATELY DIFFERENT.
 *
 * `discountCents` is promo + reward (M22), so a fixture where they coincide could not tell the two
 * apart and the mutant that reads the wrong field would SURVIVE — a degenerate fixture, which the
 * gate scores as a failure and not a skip. 900 ≠ 1400 is what separates them.
 */
let totals: Record<string, number> | null = {
  subtotalCents: 5000,
  discountCents: 1400,
  rewardCents: 500,
  rewardFaceCents: 500,
  promoCents: 900,
  serviceChargeCents: 0,
  taxCents: 330,
  tipCents: 0,
  totalCents: 3930,
};
vi.mock("./totals", () => ({
  getCartTotals: () => (totals ? Promise.resolve(totals) : Promise.reject(new Error("unreadable"))),
}));

type Row = Record<string, unknown>;
let cartRow: Row | null = null;
let itemRows: Row[] = [];

/**
 * A postgrest-ish builder that answers per TABLE, and EVALUATES its `eq` filters against the row.
 *
 * ⚠️ It discarded them until the pre-merge blind pass on #261 named the evasion: with `eq()` a no-op,
 * changing `getTableDetail`'s cart read from `.eq("status", "open")` to `"paid"` — or deleting it —
 * left all five cases green, and no mutant covered the line. The shipped behaviour that hides behind
 * that is not cosmetic: a SETTLED cart's `promo_code` reaches the drill-down, `StaffPromoControl`
 * renders (it is gated on `detail.cartId != null`, not on status), and the console announces a
 * discount on a table with no open order — while `applyPromoForTable`, which goes through the real
 * `openCartFor`, answers `no_order` to every tap on it. A fake that swallows the filters cannot see
 * a whole class of defect in the statement it is standing in for.
 */
function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const api = {
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in() {
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: "s-1",
            qr_code: "t-7",
            table_number: 7,
            mode: "dinein",
            status: "active",
            host_seat: null,
            created_at: "2026-09-05T00:00:00.000Z",
          },
          error: null,
        });
      if (name === "qr_carts") {
        // The open-cart predicate, actually applied. `cartRow` carries a `status` so a read that
        // dropped or widened the guard returns nothing instead of returning it anyway.
        const r = cartRow;
        const hit = r !== null && eqs.every(([col, val]) => !(col in r) || r[col] === val);
        return Promise.resolve({ data: hit ? r : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: { data: Row[]; error: null }) => void) {
      resolve({ data: name === "qr_cart_items" ? itemRows : [], error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const { getTableDetail } = await import("./floor");

const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  totals = {
    subtotalCents: 5000,
    discountCents: 1400,
    rewardCents: 500,
    rewardFaceCents: 500,
    promoCents: 900,
    serviceChargeCents: 0,
    taxCents: 330,
    tipCents: 0,
    totalCents: 3930,
  };
  cartRow = {
    id: "c-1",
    // Carried so the read's `.eq("status", "open")` is actually EVALUATED — the builder above
    // skips a filter naming a column the row does not have, so a fixture without it would let the
    // guard back through the hole it was just closed on.
    status: "open",
    locked: false,
    locked_at: null,
    settle_at: null,
    tab_type: "none",
    tab_opened_at: null,
    intended_tip_cents: null,
    promo_code: "PILOT15",
  };
  itemRows = [
    {
      id: "i-1",
      name: "Mohinga",
      qty: 2,
      unit_price_cents: 2500,
      by_seat: null,
      created_at: "2026-09-05T00:10:00.000Z",
      menu_item_id: null,
      state: "draft",
      comped: false,
      notes: null,
    },
  ];
});

describe("getTableDetail — the promo reaches the drill-down", () => {
  it("carries the applied CODE, so a cashier sees a discount before taking cash", async () => {
    const res = await getTableDetail(SESSION);
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.promoCode).toBe("PILOT15");
  });

  it("carries the PROMO's own contribution — not the combined discount", async () => {
    // 900 (promo) vs 1400 (promo + a 500 reward). Reading `discountCents` here would tell the
    // cashier the code is worth $14.00 when it delivered $9.00.
    const res = await getTableDetail(SESSION);
    // ASSERT, never an early `return`: vitest does not fail a test that asserted
    // nothing, so this guard left the case green under any mutation making the read
    // answer `outage` — including the one that matters most here (blind pass).
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.settlePromoCents).toBe(900);
    expect(res.detail.settleTotalCents).toBe(3930);
  });

  it("reports NO cart at all once the order is SETTLED — the read is status-guarded", async () => {
    // The predicate, not the projection. `getTableDetail` reads the cart with `.eq("status","open")`;
    // without it a settled cart's `promo_code` reaches the drill-down and `StaffPromoControl`
    // renders — it is gated on `cartId != null`, not on status — announcing a discount on a table
    // with no open order, while every tap on it is answered `no_order` by the real `openCartFor`.
    cartRow = { ...(cartRow as Row), status: "paid" };
    const res = await getTableDetail(SESSION);
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.cartId).toBeNull();
    expect(res.detail.promoCode).toBeNull();
  });

  it("reports NO code when the cart has none", async () => {
    cartRow = { ...(cartRow as Row), promo_code: null };
    const res = await getTableDetail(SESSION);
    // ASSERT, never an early `return`: vitest does not fail a test that asserted
    // nothing, so this guard left the case green under any mutation making the read
    // answer `outage` — including the one that matters most here (blind pass).
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.promoCode).toBeNull();
  });

  it("leaves the promo figure NULL when there is nothing to price — never a fabricated 0", async () => {
    // No items → `getCartTotals` is never called, so there is no total for a promo to belong to.
    // Rendering `0` here would read as "the code is worth nothing", which is a different claim.
    itemRows = [];
    const res = await getTableDetail(SESSION);
    // ASSERT, never an early `return`: vitest does not fail a test that asserted
    // nothing, so this guard left the case green under any mutation making the read
    // answer `outage` — including the one that matters most here (blind pass).
    expect(res.kind).toBe("detail");
    if (res.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(res.detail.promoCode).toBe("PILOT15");
    expect(res.detail.settlePromoCents).toBeNull();
    expect(res.detail.settleTotalCents).toBeNull();
  });

  it("reports an OUTAGE rather than a detail when the totals read fails", async () => {
    totals = null;
    const res = await getTableDetail(SESSION);
    expect(res.kind).toBe("outage");
  });
});
