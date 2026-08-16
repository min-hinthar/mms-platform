import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W17c-3 — the kiosk tip has to survive the walk to the counter.
 *
 * The diner path sends a rate at create-intent time and the charge happens in the same request. The
 * kiosk hands off to a register where a cashier takes the money minutes later, so the choice is
 * STORED as an intent on the cart. The rules pinned here:
 *   - it is refused while the cart is locked or settling — a tip must not move under a cashier who
 *     is already counting against it;
 *   - the write is status-guarded IN THE STATEMENT, not just by the check above it;
 *   - `null` (never asked) and `0` (asked, chose nothing) are BOTH storable and distinct;
 *   - the bound is refused rather than clamped.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

let authz: { uid: string; sessionId: string; locked: boolean; settling: boolean } | null = {
  uid: "u-1",
  sessionId: "s-1",
  locked: false,
  settling: false,
};
vi.mock("./authz", () => ({
  assertCartMember: () =>
    authz ? Promise.resolve(authz) : Promise.reject(new Error("not a member")),
  assertCartItemMember: () => Promise.resolve({}),
  AuthzError: class AuthzError extends Error {},
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
vi.mock("./lock", () => ({ releaseCartLock: () => Promise.resolve() }));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./order-lines", () => ({
  priceItem: () => Promise.resolve({}),
  insertOrIncLine: () => Promise.resolve(),
  touchCart: () => Promise.resolve(),
}));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));

const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
let updateError: { message: string } | null = null;
/** Rows the UPDATE matched. `[]` models the race the status predicate exists to block: a settle
 *  landed between the authz check and the write, so nothing was updated. */
let updatedRows: { id: string }[] = [{ id: "c-1" }];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          // The action awaits the terminal `.select("id")` — record the call there, and answer with
          // the rows the predicates actually matched.
          select: () => {
            updates.push({ patch, filters });
            return Promise.resolve({
              data: updateError ? null : updatedRows,
              error: updateError,
            });
          },
        };
        return chain;
      },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
    rpc: () => Promise.resolve({ data: "ok", error: null }),
  }),
}));

const { setKioskTip } = await import("./cart");

const CART = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  updates.length = 0;
  updateError = null;
  updatedRows = [{ id: "c-1" }];
  authz = { uid: "u-1", sessionId: "s-1", locked: false, settling: false };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setKioskTip — the guest's choice, stored as an intent", () => {
  it("writes the tip, status-guarded IN the statement", async () => {
    const r = await setKioskTip({ cartId: CART, tipCents: 500 });
    expect(r).toEqual({ ok: true });
    const last = updates.at(-1);
    expect(last?.patch).toEqual({ intended_tip_cents: 500 });
    // The `status=open` predicate must ride the UPDATE: a settle landing between the authz check
    // and this write must not repoint a tip the cashier is already reading.
    expect(last?.filters).toEqual({ id: CART, status: "open" });
  });

  it("stores 0 — 'asked, chose nothing' is a real answer, not an absence", async () => {
    await setKioskTip({ cartId: CART, tipCents: 0 });
    expect(updates.at(-1)?.patch).toEqual({ intended_tip_cents: 0 });
  });

  it("stores null — 'never asked', which the register renders differently from 0", async () => {
    await setKioskTip({ cartId: CART, tipCents: null });
    expect(updates.at(-1)?.patch).toEqual({ intended_tip_cents: null });
  });

  it.each([
    ["locked — someone is paying on their phone", { locked: true, settling: false }],
    ["settling — a cashier is counting against this total", { locked: false, settling: true }],
  ])("refuses while the cart is %s, and writes nothing", async (_why, state) => {
    authz = { uid: "u-1", sessionId: "s-1", ...state };
    expect(await setKioskTip({ cartId: CART, tipCents: 500 })).toEqual({ ok: false });
    expect(updates).toHaveLength(0);
  });

  it("refuses a non-member — the kiosk uid must be a member of its own session", async () => {
    authz = null;
    expect(await setKioskTip({ cartId: CART, tipCents: 500 })).toEqual({ ok: false });
    expect(updates).toHaveLength(0);
  });

  it.each([
    ["negative", -1],
    ["over the $1,000 cap", 100001],
    ["fractional cents", 500.5],
  ])("refuses a %s tip before any write", async (_why, tipCents) => {
    expect(await setKioskTip({ cartId: CART, tipCents })).toEqual({ ok: false });
    expect(updates).toHaveLength(0);
  });

  it("a failed write is reported, never a silent ok", async () => {
    updateError = { message: "boom" };
    expect(await setKioskTip({ cartId: CART, tipCents: 500 })).toEqual({ ok: false });
  });

  it("a write the status predicate BLOCKED is not reported as ok", async () => {
    // The race the predicate exists for: a settle landed between the authz check and the write, so
    // zero rows matched. `.update()` returns no row count and no error, so without the `.select`
    // verdict this would claim to have recorded an intent that never landed.
    updatedRows = [];
    expect(await setKioskTip({ cartId: CART, tipCents: 500 })).toEqual({ ok: false });
  });
});
