import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6a — the staff add path's two new money/authority rules, asserted against the CALLS the module
 * makes (the degenerate-mock lesson: assert the predicate/options, never an answer we chose):
 *
 *   • cardinality is ENFORCED (`enforceCardinality: true`) — reverting to the old lenient add ships
 *     modifier-less required items again (K17's bug, now a register-visible money rule: the priced
 *     line omits required choices the customer was quoted);
 *   • the register's qty rides to `insertOrIncLine` — dropping it silently collapses a "3 × curry"
 *     add to one unit while the cashier quotes three;
 *   • W16a — the session's mode rides into the PRICE: a counter/pickup session prices togo (×1.05),
 *     a table session dinein (×1.15). Collapsing the fork misprices every register add.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const priceItemCalls: { menuItemId: string; modifierIds: string[]; opts?: unknown }[] = [];
let priceItemThrows = false;
const insertCalls: {
  cartId: string;
  bySeat: string | null;
  qty: number | undefined;
  fulfillment: unknown;
  taxCents: unknown;
}[] = [];

vi.mock("./order-lines", () => ({
  priceItem: (menuItemId: string, modifierIds: string[], opts?: unknown) => {
    priceItemCalls.push({ menuItemId, modifierIds, opts });
    if (priceItemThrows) return Promise.reject(new Error("choose a required option"));
    return Promise.resolve({
      name: "Chicken Curry",
      unitPriceCents: 1450,
      category: "hot_prepared",
      opts: [],
    });
  },
  insertOrIncLine: (
    cartId: string,
    line: { fulfillment?: unknown; taxCents?: unknown },
    bySeat: string | null,
    qty?: number,
  ) => {
    insertCalls.push({
      cartId,
      bySeat,
      qty,
      fulfillment: line.fulfillment,
      taxCents: line.taxCents,
    });
    return Promise.resolve();
  },
  touchCart: () => Promise.resolve(),
}));

vi.mock("./staff", () => ({
  staffGate: () =>
    Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1", role: "server" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
vi.mock("./lock", () => ({
  acquireSettlement: () => Promise.resolve("acquired"),
  releaseSettlement: () => Promise.resolve(null),
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./stripe", () => ({ getStripe: () => ({}) }));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

// Per-test session mode (W16a): the mode now decides the PRICE fork, so both directions get a pin.
let sessionMode = "pickup";

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, _v: unknown) => ({
          maybeSingle: () =>
            Promise.resolve(
              table === "table_sessions"
                ? { data: { id: SESSION, status: "active", mode: sessionMode }, error: null }
                : { data: null, error: null },
            ),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                table === "qr_carts"
                  ? {
                      data: {
                        id: "cart-1",
                        locked: false,
                        locked_at: null,
                        settle_at: null,
                        tab_type: "none",
                      },
                      error: null,
                    }
                  : { data: null, error: null },
              ),
          }),
        }),
      }),
    }),
  }),
}));

const SESSION = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const { staffAddItem } = await import("./staff-cart");

beforeEach(() => {
  priceItemCalls.length = 0;
  insertCalls.length = 0;
  priceItemThrows = false;
  sessionMode = "pickup";
});

describe("staffAddItem — cardinality + qty are money rules (W6a)", () => {
  it("prices every staff add with cardinality ENFORCED — and the price takes no mode (W17a)", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(priceItemCalls).toHaveLength(1);
    // W17a — the POS price is the POS price: nothing about the session's mode reaches the pricing
    // seam. A `fulfillment` here would be a markup limb growing back.
    expect(priceItemCalls[0]?.opts).toEqual({ enforceCardinality: true });
  });

  it("tags a pickup/counter session's line togo — the routing + tax fork", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(insertCalls[0]?.fulfillment).toBe("togo");
    // Cold food is exempt to-go; hot_prepared is taxable either way, so the fixture's tax is the
    // 10.5% rate on 1450 — computed in the shell, never transcribed.
    expect(insertCalls[0]?.taxCents).toBe(152);
  });

  it("tags a TABLE session's line dinein — the other arm of the fork", async () => {
    sessionMode = "dinein";
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(true);
    expect(insertCalls[0]?.fulfillment).toBe("dinein");
    expect(insertCalls[0]?.taxCents).toBe(152);
  });

  it("forwards the register's qty to the ledger insert", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM, qty: 3 });
    expect(r.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.qty).toBe(3);
    expect(insertCalls[0]?.bySeat).toBeNull();
  });

  it("a cardinality refusal lands NO line", async () => {
    priceItemThrows = true;
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM });
    expect(r.ok).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });

  it("bounds qty at the schema (10 is refused before any pricing)", async () => {
    const r = await staffAddItem({ sessionId: SESSION, menuItemId: ITEM, qty: 10 });
    expect(r).toEqual({ ok: false, error: "Invalid request." });
    expect(priceItemCalls).toHaveLength(0);
  });
});
